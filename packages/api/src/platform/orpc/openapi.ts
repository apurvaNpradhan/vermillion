import { SmartCoercionHandlerPlugin } from "@orpc/json-schema";
import { OpenAPIGenerator } from "@orpc/openapi";
import { ZodToJsonSchemaConverter } from "@orpc/zod";

import { SESSION_SCHEME } from "./base";
import type { Services } from "../services";
import type { AppRouter } from "./router";

/** Where the reference (spec and UI) is mounted; the spec's server URL. */
export const OPENAPI_PREFIX = "/api/reference";

/** One tag per vertical; the order here is the order in the reference sidebar. */
const TAGS = [
  { name: "Auth", description: "What the sign-in screens need before anyone is signed in." },
  { name: "Account", description: "The signed-in user's own account." },
  { name: "Preferences", description: "Per-user settings such as the language." },
  { name: "Sync", description: "Local-first sync: PowerSync credentials and client uploads." },
];

const converters = [new ZodToJsonSchemaConverter()];
const generator = new OpenAPIGenerator({ converters });

/** Query, path and form values arrive as strings; this restores numbers and booleans from the schema. */
export const smartCoercion = () => new SmartCoercionHandlerPlugin({ converters });

/** Where Better Auth's endpoints are mounted. */
const AUTH_PREFIX = "/api/auth";

/** Better Auth's generated schema; its paths, tags and schemas are merged into the document. */
export type AuthOpenApiSchema = Awaited<
  ReturnType<Services["auth"]["api"]["generateOpenAPISchema"]>
>;

type OpenApiDocument = Awaited<ReturnType<OpenAPIGenerator["generate"]>>;

/**
 * The OpenAPI document for the router, with Better Auth's endpoints when its
 * schema is given. Better Auth's paths are relative to `/api/auth`, so each
 * operation carries its own `servers` entry instead of being rewritten.
 * Routes of the router are the same procedures over plain HTTP.
 */
export async function generateOpenApiDocument(
  router: AppRouter,
  info: { name: string; version: string },
  authSchema?: AuthOpenApiSchema,
): Promise<OpenApiDocument> {
  const document = await generator.generate(router, {
    base: {
      info: {
        title: `${info.name} API`,
        version: info.version,
        description: [
          "Typed API for the native app. The apps call it over oRPC; these routes expose the same procedures as plain HTTP.",
          "",
          "Authenticate with the Better Auth session cookie (sign in through `/api/auth/sign-in/email`). " +
            "Failures answer `{ code, message }` with the status of the code.",
        ].join("\n"),
      },
      servers: [{ url: OPENAPI_PREFIX, description: "This server" }],
      tags: TAGS,
      components: {
        securitySchemes: {
          [SESSION_SCHEME]: {
            type: "apiKey",
            in: "cookie",
            name: "better-auth.session_token",
            description: "Session cookie set by Better Auth at sign-in.",
          },
        },
      },
    },
  });

  if (!authSchema) return document;

  const authPaths = Object.fromEntries(
    Object.entries(authSchema.paths).map(([path, item]) => [
      path,
      Object.fromEntries(
        Object.entries(item).map(([method, operation]) => [
          method,
          { ...operation, servers: [{ url: AUTH_PREFIX, description: "Better Auth" }] },
        ]),
      ),
    ]),
  );
  // SAFETY: the merge only adds Better Auth's paths, tags and schemas, all
  // OpenAPI objects; its generator types them more loosely than the document.
  return {
    ...document,
    tags: [...(document.tags ?? []), ...authSchema.tags],
    paths: { ...authPaths, ...document.paths },
    components: {
      ...document.components,
      schemas: { ...authSchema.components.schemas, ...document.components?.schemas },
    },
  } as OpenApiDocument;
}
