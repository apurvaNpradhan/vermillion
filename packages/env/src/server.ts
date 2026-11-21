import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

import { exitOnInvalidEnv, PLACEHOLDER_SECRET } from "./shared";

const isProductionEnv = process.env.NODE_ENV === "production";

/**
 * Development and CI use the MinIO of `docker-compose.yml`. Production has no default: the empty
 * string fails validation, so the bucket must be configured.
 */
const mediaDefault = (value: string) => (isProductionEnv ? "" : value);
const DEV_MEDIA_SECRET = "vermillion-local-secret";

/**
 * Server environment. Importing this module validates `process.env` and exits
 * with a readable message when something is missing or malformed. Only the
 * server process imports it.
 */
export const env = createEnv({
  emptyStringAsUndefined: true,
  runtimeEnv: process.env,
  server: {
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    DATABASE_URL: z.string().min(1),
    /** Public origin of the API (`https://basalt-api.<domain>` in production). */
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
    /** `true`: anyone may sign up. `false`: only an address with a live invite (the closed beta). */
    REGISTRATION_OPEN: z.stringbool().default(true),
    /**
     * Comma-separated addresses that hold the admin role; every other account is a user. The only
     * way to become an admin. Empty means no admin.
     */
    ADMIN_EMAILS: z.string().default(""),
    TURNSTILE_SECRET_KEY: z.string().optional(),
    /** Sentry DSN of the server project; error reporting runs only when set. */
    SENTRY_DSN: z.url().optional(),
    /** Release name for Sentry events (the image build sets it to the commit); defaults to the version. */
    SENTRY_RELEASE: z.string().optional(),
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    GITHUB_CLIENT_ID: z.string().optional(),
    GITHUB_CLIENT_SECRET: z.string().optional(),
    RESEND_API_KEY: z.string().optional(),
    EMAIL_FROM: z.string().optional(),
    /** Log emails instead of sending them, even in production (throwaway stacks). */
    EMAIL_CONSOLE: z.stringbool().default(false),
    /**
     * Hold a Catalog patch that needs a newer app than `minimum_app_version` until the minimum
     * reaches it. On in production, off elsewhere (ADR 0050).
     */
    CATALOG_PATCH_GATE: z.stringbool().default(isProductionEnv),
    /** Public URL of the PowerSync service, handed to clients. Defaults to the local dev service. */
    SYNC_ENDPOINT_URL: z.url().optional(),
    /** Replication slot lag (MiB of WAL behind) that logs a warning. */
    SYNC_SLOT_LAG_WARN_MB: z.coerce.number().int().positive().default(1024),
    /** Lag that logs an error and marks `/api/ready` degraded. */
    SYNC_SLOT_LAG_CRITICAL_MB: z.coerce.number().int().positive().default(3072),
    /** S3 API of the private user-media bucket (ADR 0040): MinIO locally, R2 in production. */
    MEDIA_S3_ENDPOINT: z.url().default(mediaDefault("http://127.0.0.1:9000")),
    /** `auto` for R2. */
    MEDIA_S3_REGION: z.string().min(1).default("auto"),
    MEDIA_S3_BUCKET: z.string().min(1).default(mediaDefault("vermillion-user-media")),
    MEDIA_S3_ACCESS_KEY_ID: z.string().min(1).default(mediaDefault("vermillion")),
    MEDIA_S3_SECRET_ACCESS_KEY: z
      .string()
      .min(1)
      .default(mediaDefault(DEV_MEDIA_SECRET))
      .refine(
        (secret) => !isProductionEnv || secret !== DEV_MEDIA_SECRET,
        "Use the R2 API token's secret as MEDIA_S3_SECRET_ACCESS_KEY in production",
      ),
    /**
     * S3 API of the public catalog exercise-media bucket: the MinIO of docker-compose.yml locally,
     * an R2 bucket on `media.<domain>` in production. A token scoped to that bucket only.
     */
    EXERCISE_MEDIA_S3_ENDPOINT: z.url().default(mediaDefault("http://127.0.0.1:9000")),
    EXERCISE_MEDIA_S3_REGION: z.string().min(1).default("auto"),
    EXERCISE_MEDIA_S3_BUCKET: z.string().min(1).default(mediaDefault("vermillion-exercise-media")),
    EXERCISE_MEDIA_S3_ACCESS_KEY_ID: z.string().min(1).default(mediaDefault("vermillion")),
    EXERCISE_MEDIA_S3_SECRET_ACCESS_KEY: z
      .string()
      .min(1)
      .default(mediaDefault(DEV_MEDIA_SECRET))
      .refine(
        (secret) => !isProductionEnv || secret !== DEV_MEDIA_SECRET,
        "Use the R2 API token's secret as EXERCISE_MEDIA_S3_SECRET_ACCESS_KEY in production",
      ),
    /**
     * Where the exercise-media bucket's objects are read. Production defaults to the media host of
     * app.config.ts; development to the MinIO bucket's path.
     */
    EXERCISE_MEDIA_PUBLIC_URL: z.url().optional(),
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
