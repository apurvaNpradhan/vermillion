import { serve } from "@hono/node-server";
import { createDb } from "@workspace/db";
import { runMigrations } from "@workspace/db/migrator";
import type { EmailTransport } from "@workspace/email";
import { log } from "@workspace/logger";
import { sql } from "drizzle-orm";

import type { ApiConfig } from "./config";
import { createApp, type CreateAppOptions } from "./create-app";
import { prepareDatabaseStartup } from "./database/prepare-database-startup";
import { waitForDatabase } from "./database/wait-for-database";
import { createServices } from "./services";
import { drainHttpServer } from "./drain-http-server";

export type RunServerOptions = {
  config: ApiConfig;
  databaseUrl: string;
  port: number;
  emailTransport: EmailTransport;
  app?: CreateAppOptions;
  /** Folder of generated migrations; defaults to the db package's. */
  migrationsFolder?: string;
};

/**
 * Waits for the database, migrates, starts jobs, and only then listens.
 * Handles SIGTERM/SIGINT: stop accepting, drain pending background work (bounded),
 * stop job workers, close the pool.
 */
export async function runServer(options: RunServerOptions) {
  const { db, pool } = createDb(options.databaseUrl);
  // Only the error name: driver messages can quote row values.
  pool.on("error", (error) => log.warn({ action: "db.pool.idle-error", errorName: error.name }));

  await prepareDatabaseStartup({
    databaseUrl: options.databaseUrl,
    waitForDatabase: () => waitForDatabase({ query: () => db.execute(sql`SELECT 1`) }),
    runStartupMigrations: () => runMigrations({ pool }, options.migrationsFolder),
  });

  const services = createServices({
    config: options.config,
    db,
    emailTransport: options.emailTransport,
    jobs: { boss: { connectionString: options.databaseUrl, max: 3 } },
  });
  await services.start();

  const server = serve(
    { fetch: createApp(services, options.app).fetch, port: options.port },
    (info) => {
      log.info({ action: "server.listening", port: info.port });
    },
  );

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info({ action: "server.shutdown" });
    const deadline = Date.now() + 10_000;
    // One hard deadline covers active HTTP, queued emails, workers and the database pool.
    const timer = setTimeout(() => {
      log.warn({ action: "server.shutdown", message: "Shutdown deadline exceeded" });
      process.exit(1);
    }, 10_000);
    try {
      await drainHttpServer(server);
      const { drained } = await services.stop(Math.max(0, deadline - Date.now()));
      if (!drained) log.warn({ action: "server.shutdown", message: "Timed out draining emails" });
      await pool.end();
      clearTimeout(timer);
      process.exit(drained ? 0 : 1);
    } catch {
      // Errors may contain SQL/credentials; report only the failed phase.
      log.error({ action: "server.shutdown", message: "Graceful shutdown failed" });
      process.exit(1);
    }
  };
  process.on("SIGTERM", () => void shutdown());
  process.on("SIGINT", () => void shutdown());
}
