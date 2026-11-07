import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferenceHandlerPlugin } from "@orpc/openapi/plugins";
import { ORPCError, onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { HTTP_STATUS_BY_CODE } from "@workspace/shared";
import { currentRequestLog, log, requestLoggingOptions } from "@workspace/logger";
import type { DrainFn } from "evlog";
import { createAuthMiddleware } from "evlog/better-auth";
import { evlog, type EvlogVariables } from "evlog/hono";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";

import { authRoutes } from "../auth/index";
import { clientIpMiddleware } from "./http/client-ip";
import { compressResponses } from "./http/compress";
import { requireTrustedOrigin } from "./http/require-trusted-origin";
import { healthRoutes } from "./health";
import { generateOpenApiDocument, OPENAPI_PREFIX, smartCoercion } from "./orpc/openapi";
import { appRouter } from "./orpc/router";
import type { Services } from "./services";

function statusForCode(code: string) {
  const known = Object.entries(HTTP_STATUS_BY_CODE).find(([name]) => name === code);
  return known ? known[1] : 500;
}

export type CreateAppOptions = {
  /** Where wide events go besides stdout (a file drain in development). */
  drain?: DrainFn | undefined;
};

// Typed failures (ORPCError) are expected; only the unexpected is logged as an error.
function reportUnexpected(error: Error | string) {
  const request = currentRequestLog();
  if (request) request.error(error);
  else log.error({ action: "orpc.unexpected" });
}

/**
 * Assembles the HTTP app: client IP, request logging, one error handler,
 * compression, health, the auth routes, the RPC handler and the OpenAPI
 * reference. Everything runs against the given services, so a test can build
 * the same app over an in-memory database.
 */
export function createApp(services: Services, options: CreateAppOptions = {}) {
  const { config } = services;
  const app = new Hono<EvlogVariables>();

  app.use("*", clientIpMiddleware(config.trustedProxies));
  app.use("*", evlog({ ...requestLoggingOptions, drain: options.drain }));

  const identifyUser = createAuthMiddleware(services.auth, {
    exclude: ["/api/auth/**"],
    maskEmail: true,
  });
  app.use("*", async (c, next) => {
    // Excluded paths (health) have no request log, and nobody to identify.
    const requestLog = c.get("log");
    if (requestLog) await identifyUser(requestLog, c.req.raw.headers, c.req.path);
    await next();
  });

  app.onError((error, c) => {
    if (error instanceof HTTPException) {
      return error.getResponse();
    }
    // Domain code throws ORPCError even when an HTTP route calls it.
    if (error instanceof ORPCError) {
      const status = statusForCode(error.code);
      return c.json({ code: error.code, message: error.message }, status);
    }
    currentRequestLog()?.error(error instanceof Error ? error : String(error));
    return c.json({ message: "Internal Server Error" }, 500);
  });

  app.use(compressResponses);

  const trustOrigin = requireTrustedOrigin([config.appUrl]);
  app.use("/rpc/*", trustOrigin);
  app.use("/api/*", trustOrigin);

  app.route("/api", healthRoutes);
  app.route("/api", authRoutes(services));

  const rpcHandler = new RPCHandler(appRouter, {
    interceptors: [
      onError((error) => {
        if (!(error instanceof ORPCError))
          reportUnexpected(error instanceof Error ? error : String(error));
      }),
    ],
  });
  app.use("/rpc/*", async (c, next) => {
    const { matched, response } = await rpcHandler.handle(c.req.raw, {
      prefix: "/rpc",
      context: { headers: c.req.raw.headers, services },
    });
    return matched ? c.newResponse(response.body, response) : next();
  });

  if (config.openApiReference) {
    const openApiHandler = new OpenAPIHandler(appRouter, {
      interceptors: [
        onError((error) => {
          if (!(error instanceof ORPCError))
            reportUnexpected(error instanceof Error ? error : String(error));
        }),
      ],
      plugins: [
        smartCoercion(),
        new OpenAPIReferenceHandlerPlugin({
          spec: async () =>
            generateOpenApiDocument(
              appRouter,
              { name: config.appName, version: config.appVersion },
              await services.auth.api.generateOpenAPISchema(),
            ),
        }),
      ],
    });
    app.use(`${OPENAPI_PREFIX}/*`, async (c, next) => {
      const { matched, response } = await openApiHandler.handle(c.req.raw, {
        prefix: OPENAPI_PREFIX,
        context: { headers: c.req.raw.headers, services },
      });
      return matched ? c.newResponse(response.body, response) : next();
    });
  }

  return app;
}
