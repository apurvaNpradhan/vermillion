import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

import { exitOnInvalidEnv, PLACEHOLDER_SECRET } from "./shared";

/** Passwords end up in connection URLs, so only URL-safe characters are accepted. */
const servicePassword = (name: string) =>
  z
    .string()
    .min(16, `${name} must be at least 16 characters (openssl rand -hex 24)`)
    .regex(/^[A-Za-z0-9._~-]+$/, `${name} may only contain letters, digits and . _ ~ -`)
    .refine(
      (password) => process.env.NODE_ENV !== "production" || !PLACEHOLDER_SECRET.test(password),
      `Use a generated ${name} in production`,
    );

/**
 * Environment of the replication bootstrap (`pnpm sync:bootstrap`, or the
 * one-shot job in production). Separate from the server's: the job needs the
 * admin URL and the two PowerSync passwords, not the auth secret.
 */
export const env = createEnv({
  emptyStringAsUndefined: true,
  runtimeEnv: process.env,
  server: {
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    /** The runtime URL of the application role; that role owns the publication. */
    DATABASE_URL: z.string().min(1),
    /** Privileged URL of the same database. Defaults to DATABASE_URL (development only). */
    SYNC_ADMIN_DATABASE_URL: z.string().min(1).optional(),
    POWERSYNC_REPLICATION_PASSWORD: servicePassword("POWERSYNC_REPLICATION_PASSWORD"),
    POWERSYNC_STORAGE_PASSWORD: servicePassword("POWERSYNC_STORAGE_PASSWORD"),
  },
  onValidationError: exitOnInvalidEnv("sync bootstrap environment"),
});
