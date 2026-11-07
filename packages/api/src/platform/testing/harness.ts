import { PGlite } from "@electric-sql/pglite";
import { createRouterClient } from "@orpc/server";
import { relations } from "@workspace/db";
import { migrationsFolder } from "@workspace/db/migrator";
import type { EmailTransport, RenderedEmail } from "@workspace/email";
import { type SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { fromPglite } from "pg-boss";
import { z } from "zod";

import type { ApiConfig } from "../config";
import { createApp } from "../create-app";
import { appRouter } from "../orpc/router";
import { createServices } from "../services";

const baseConfig: ApiConfig = {
  appName: "Vermillion",
  appVersion: "1.0.0",
  appUrl: "http://localhost:3001",
  appScheme: "vermillion",
  nativePort: 8081,
  isProduction: false,
  authSecret: "test-secret-0123456789abcdefghijklmnopqrstuvwxyz",
  trustedProxies: "127.0.0.0/8",
  registrationOpen: true,
  adminEmails: [],
  openApiReference: false,
};

/** One row of a raw query; the test knows which columns it asked for. */
const rowSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.date(), z.null()]),
);
type Row = z.infer<typeof rowSchema>;

export type TestAppOptions = {
  config?: Partial<ApiConfig>;
  /** Replaces the CAPTCHA provider's `fetch`. */
  fetch?: typeof fetch;
  /** Fails the next sends: used to exercise job retries. */
  failEmails?: { remaining: number };
};

/**
 * The API over an in-process Postgres (PGlite) with every migration applied.
 * Only the network boundaries are replaced: the email transport collects into
 * `outbox`, and `fetch` is replaced when a test gives one. Jobs run in-process
 * with short retry delays.
 */
export async function createTestApp(options: TestAppOptions = {}) {
  const pg = new PGlite();
  const db = drizzle({ client: pg, relations });
  await migrate(db, { migrationsFolder });

  const outbox: RenderedEmail[] = [];
  const emailTransport: EmailTransport = {
    async send(email) {
      if (options.failEmails && options.failEmails.remaining > 0) {
        options.failEmails.remaining -= 1;
        throw new Error("provider unavailable");
      }
      outbox.push(email);
    },
  };

  const services = createServices({
    config: { ...baseConfig, ...options.config },
    // The PGlite driver is the same Drizzle database over a different driver.
    db,
    emailTransport,
    jobs: {
      boss: { db: fromPglite(pg) },
      defaults: { retryDelay: 0, retryBackoff: false, pollingIntervalSeconds: 0.5 },
    },
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });
  await services.start();

  const app = createApp(services);

  return {
    services,
    app,
    outbox,
    /** Rows of a raw query, for asserting on what is stored. */
    async rows(query: SQL): Promise<Row[]> {
      const result = await db.execute(query);
      return z.array(rowSchema).parse(result.rows);
    },
    /** An RPC client calling the router in-process with these request headers. */
    client(headers: Headers = new Headers()) {
      return createRouterClient(appRouter, { context: { headers, services } });
    },
    /** Polls until an email matching `predicate` was sent (jobs run asynchronously). */
    async waitForEmail(predicate: (email: RenderedEmail) => boolean, timeoutMs = 10_000) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const found = outbox.find(predicate);
        if (found) return found;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      throw new Error("Timed out waiting for an email");
    },
    async close() {
      await services.stop(2_000);
      await pg.close();
    },
  };
}

export type TestApp = Awaited<ReturnType<typeof createTestApp>>;

const PASSWORD = "correct-horse-battery";

/** The first link in an email's text body. */
export function linkIn(email: RenderedEmail) {
  const link = /https?:\/\/\S+/.exec(email.text)?.[0];
  if (!link) throw new Error("No link in email");
  return link.replace(/[).,]+$/, "");
}

/** A `Cookie` header from the `Set-Cookie` headers of a Better Auth response. */
export function cookieFrom(response: Response) {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

/**
 * Registers and verifies a user through the real flow (sign-up, the queued
 * verification email, the link), then signs in. Returns request headers that
 * carry the session.
 */
export async function createSignedInUser(
  app: TestApp,
  email: string,
  name = "Test User",
): Promise<Headers> {
  await app.services.auth.api.signUpEmail({ body: { email, password: PASSWORD, name } });
  const mail = await app.waitForEmail((m) => m.to === email && m.subject.includes("Verify"));
  const verify = await app.services.auth.handler(new Request(linkIn(mail)));
  if (verify.status >= 400) throw new Error(`Verification failed: ${verify.status}`);
  return signIn(app, email);
}

export async function signIn(
  app: TestApp,
  email: string,
  headers: Headers = new Headers(),
): Promise<Headers> {
  const response = await app.services.auth.api.signInEmail({
    body: { email, password: PASSWORD },
    headers,
    asResponse: true,
  });
  if (!response.ok) throw new Error(`Sign-in failed: ${response.status}`);
  return new Headers({ cookie: cookieFrom(response) });
}

export { PASSWORD };
