// Provisions PowerSync's access to Postgres (ADR 0023). Idempotent and safe to
// run on every deploy: `pnpm sync:bootstrap` in development, `node sync-bootstrap.mjs`
// from the server image as a one-shot job in production.
import { bootstrapReplication, BootstrapPreflightError } from "@workspace/api";
import { env } from "@workspace/env/sync-bootstrap";
import { initLogger, log } from "@workspace/logger";

import { appConfig } from "../../../app.config";

initLogger({ env: { service: `${appConfig.name}-sync-bootstrap` } });

try {
  const result = await bootstrapReplication({
    adminUrl: env.SYNC_ADMIN_DATABASE_URL ?? env.DATABASE_URL,
    databaseUrl: env.DATABASE_URL,
    replicationPassword: env.POWERSYNC_REPLICATION_PASSWORD,
    storagePassword: env.POWERSYNC_STORAGE_PASSWORD,
    isProduction: env.NODE_ENV === "production",
  });
  for (const message of result.warnings) log.warn({ action: "sync.bootstrap", message });
  log.info({ action: "sync.bootstrap", message: "Replication bootstrap complete" });
} catch (error) {
  // Messages hold names, settings and error codes, never passwords.
  log.error({
    action: "sync.bootstrap",
    message: error instanceof Error ? error.message : "Replication bootstrap failed",
    preflight: error instanceof BootstrapPreflightError,
  });
  process.exit(1);
}
