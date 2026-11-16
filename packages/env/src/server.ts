import { createEnv } from "@t3-oss/env-core";
import {
  APPLE_TEAM_ID_PATTERN,
  CERT_SHA256_PATTERN,
  isAndroidOrigin,
  parseCsv,
} from "@workspace/shared";
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
    /** Public origin of the API (`https://cinnabar-api.<domain>` in production). */
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
    REGISTRATION_OPEN: z.stringbool().default(true),
    /**
     * Passkey relying-party id: a bare hostname the API origin is on or under. Defaults to the
     * hostname of APP_URL. It cannot change later without orphaning every registered passkey.
     */
    AUTH_RP_ID: z
      .string()
      .regex(/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/i, "AUTH_RP_ID must be a hostname, no scheme")
      .optional(),
    /**
     * Comma-separated origins a passkey ceremony may come from: HTTPS origins (https://host) and
     * Android origins (android:apk-key-hash:...). Defaults to the APP_URL origin. Android origins for
     * ANDROID_CERT_SHA256 are added automatically.
     */
    AUTH_PASSKEY_ORIGINS: z
      .string()
      .refine(
        (value) =>
          parseCsv(value).every((origin) => {
            if (isAndroidOrigin(origin)) return true;
            try {
              return new URL(origin).origin === origin;
            } catch {
              return false;
            }
          }),
        "AUTH_PASSKEY_ORIGINS must be origins without a path, or android:apk-key-hash:... entries",
      )
      .optional(),
    /** Comma-separated colon-hex SHA-256 fingerprints of the Android signing certificates. */
    ANDROID_CERT_SHA256: z
      .string()
      .refine(
        (value) => parseCsv(value).every((entry) => CERT_SHA256_PATTERN.test(entry.toUpperCase())),
        "ANDROID_CERT_SHA256 must be colon-separated SHA-256 fingerprints (keytool output)",
      )
      .optional(),
    /** Apple Developer team id, published at /.well-known/apple-app-site-association. */
    APPLE_TEAM_ID: z
      .string()
      .regex(APPLE_TEAM_ID_PATTERN, "APPLE_TEAM_ID must be 10 uppercase letters or digits")
      .optional(),
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
