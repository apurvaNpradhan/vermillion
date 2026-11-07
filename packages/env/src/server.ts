import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

import { exitOnInvalidEnv, PLACEHOLDER_SECRET } from "./shared";

/**
 * Server environment. Importing this module validates `process.env` and exits
 * with a readable message when something is missing or malformed. Only the
 * server process imports it; the web bundle gets `./web` instead.
 */
export const env = createEnv({
  emptyStringAsUndefined: true,
  runtimeEnv: process.env,
  server: {
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    DATABASE_URL: z.string().min(1),
    /** Public origin of the app (web and API share it in production). */
    APP_URL: z.url(),
    BETTER_AUTH_SECRET: z
      .string()
      .min(32, "BETTER_AUTH_SECRET must be at least 32 characters (openssl rand -hex 32)")
      .refine(
        (secret) => process.env.NODE_ENV !== "production" || !PLACEHOLDER_SECRET.test(secret),
        "Use a generated BETTER_AUTH_SECRET in production",
      ),
    /** Comma-separated IPs/CIDRs of proxies allowed to set X-Forwarded-For, or "none". */
    TRUSTED_PROXIES: z.string().default("127.0.0.0/8,::1/128"),
    /** Comma-separated emails that hold the admin role (when verified). */
    ADMIN_EMAILS: z.string().default(""),
    REGISTRATION_OPEN: z.stringbool().default(true),
    TURNSTILE_SECRET_KEY: z.string().optional(),
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    GITHUB_CLIENT_ID: z.string().optional(),
    GITHUB_CLIENT_SECRET: z.string().optional(),
    RESEND_API_KEY: z.string().optional(),
    EMAIL_FROM: z.string().optional(),
    /** Log emails instead of sending them, even in production (throwaway stacks). */
    EMAIL_CONSOLE: z.stringbool().default(false),
    /** Public URL of the PowerSync service, handed to clients. Defaults to the local dev service. */
    SYNC_ENDPOINT_URL: z.url().optional(),
    /** Replication slot lag (MiB of WAL behind) that logs a warning. */
    SYNC_SLOT_LAG_WARN_MB: z.coerce.number().int().positive().default(1024),
    /** Lag that logs an error and marks `/api/ready` degraded. */
    SYNC_SLOT_LAG_CRITICAL_MB: z.coerce.number().int().positive().default(3072),
  },
  createFinalSchema: (fields) =>
    z
      .object(fields)
      .refine((value) => value.SYNC_SLOT_LAG_CRITICAL_MB > value.SYNC_SLOT_LAG_WARN_MB, {
        path: ["SYNC_SLOT_LAG_CRITICAL_MB"],
        message: "SYNC_SLOT_LAG_CRITICAL_MB must be greater than SYNC_SLOT_LAG_WARN_MB",
      }),
  onValidationError: exitOnInvalidEnv("server environment"),
});
