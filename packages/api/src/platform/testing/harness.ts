import { createRouterClient } from "@orpc/server";
import { createDb } from "@workspace/db";
import type { EmailTransport, RenderedEmail } from "@workspace/email";
import { type SQL } from "drizzle-orm";
import { inject } from "vitest";
import { z } from "zod";

import type { ApiConfig } from "../config";
import { createApp } from "../create-app";
import { appRouter } from "../orpc/router";
import { createServices } from "../services";
import { cloneDatabase, dropDatabase, urlForDatabase } from "./postgres";

const baseConfig: ApiConfig = {
  appName: "Vermillion",
  appVersion: "1.0.0",
  appUrl: "http://localhost:3000",
  appScheme: "vermillion",
  nativePort: 8081,
  passkey: { rpId: "localhost", origins: ["http://localhost:3000"] },
  appAssociation: {
    androidPackage: "com.example.app",
    iosBundleId: "com.example.app",
    androidCertFingerprints: [],
  },
  isProduction: false,
  authSecret: "test-secret-0123456789abcdefghijklmnopqrstuvwxyz",
  trustedProxies: "127.0.0.0/8",
  registrationOpen: true,
  adminEmails: [],
  openApiReference: false,
  sync: { slotLag: { warnBytes: 1024 ** 3, criticalBytes: 3 * 1024 ** 3 } },
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
 * The API over its own clone of the migrated template database on the Docker
 * Postgres (see global-setup.ts); the clone is dropped by `close()`. Only the network boundaries are replaced: the email transport collects into
 * `outbox`, and `fetch` is replaced when a test gives one. Jobs run in-process
 * with short retry delays.
 */
export async function createTestApp(options: TestAppOptions = {}) {
  const database = await cloneDatabase(inject("testTemplateDatabase"), inject("testRunId"));
  const databaseUrl = urlForDatabase(database);
  // Small pools: test files run in parallel against one Postgres.
  const { db, pool } = createDb(databaseUrl, { max: 4 });

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
    db,
    emailTransport,
    jobs: {
      boss: { connectionString: databaseUrl, max: 3 },
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
      return z.object({ rows: z.array(rowSchema) }).parse(result).rows;
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
      try {
        await services.stop(2_000);
      } finally {
        await pool.end();
        await dropDatabase(database);
      }
    },
  };
}

export type TestApp = Awaited<ReturnType<typeof createTestApp>>;

/** The first link in an email's text body. */
export function linkIn(email: RenderedEmail) {
  const link = /https?:\/\/\S+/.exec(email.text)?.[0];
  if (!link) throw new Error("No link in email");
  return link.replace(/[).,]+$/, "");
}

/** The one-time code of a code email; its subject starts with it in every language. */
export function codeIn(email: RenderedEmail) {
  const code = /^(\d{6})\b/.exec(email.subject)?.[1];
  if (!code) throw new Error("No code in email");
  return code;
}

/** A `Cookie` header from the `Set-Cookie` headers of a Better Auth response. */
export function cookieFrom(response: Response) {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

/** Asks for a sign-in code the way the clients do and returns the code that was emailed. */
export async function requestSignInCode(
  app: TestApp,
  email: string,
  headers: Headers = new Headers(),
) {
  const seen = app.outbox.length;
  await app.services.auth.api.sendVerificationOTP({ body: { email, type: "sign-in" }, headers });
  const mail = await app.waitForEmail(
    (m) => m.to === email && app.outbox.indexOf(m) >= seen && /^\d{6}\b/.test(m.subject),
  );
  return codeIn(mail);
}

/**
 * Signs in with a code through the real flow (request, email, redeem). A new address gets an
 * account named `name`. Returns request headers that carry the session.
 */
export async function signIn(
  app: TestApp,
  email: string,
  options: { name?: string; headers?: Headers } = {},
): Promise<Headers> {
  const headers = options.headers ?? new Headers();
  const otp = await requestSignInCode(app, email, headers);
  const response = await app.services.auth.api.signInEmailOTP({
    body: { email, otp, ...(options.name ? { name: options.name } : {}) },
    headers,
    asResponse: true,
  });
  if (!response.ok) throw new Error(`Sign-in failed: ${response.status}`);
  return new Headers({ cookie: cookieFrom(response) });
}

/** A signed-in user (created on first use), as request headers carrying the session. */
export function createSignedInUser(app: TestApp, email: string, name = "Test User") {
  return signIn(app, email, { name });
}
