import { log } from "@workspace/logger";

type PrepareDatabaseStartupOptions = {
  databaseUrl: string;
  waitForDatabase: () => Promise<void>;
  runStartupMigrations: () => Promise<void>;
  logInfo?: (message: string, target: DatabaseTarget) => void;
  logError?: (message: string, target: DatabaseTarget, error: Error) => void;
};

export type DatabaseTarget = { host: string; port: number; database: string; username: string };

/** The connection target without its password, for logs and errors. */
export function describeTarget(databaseUrl: string): DatabaseTarget {
  try {
    const url = new URL(databaseUrl);
    if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname) throw new Error();
    return {
      host: url.hostname,
      port: Number(url.port || 5432),
      database: url.pathname.replace(/^\//, ""),
      username: decodeURIComponent(url.username),
    };
  } catch {
    // URL parser errors include the credential-bearing input. Never retain them as a cause.
    throw new Error("Invalid DATABASE_URL. Expected a PostgreSQL connection URL.");
  }
}

/**
 * Waits for the database, then migrates. Only after this resolves may the
 * server listen. Neither logs nor thrown errors ever contain the password:
 * driver/parser errors are deliberately not retained as causes (Node prints them on uncaught rejection).
 */
export async function prepareDatabaseStartup({
  databaseUrl,
  waitForDatabase,
  runStartupMigrations,
  logInfo = (message, target) => log.info({ action: "db.startup", message, target }),
  logError = (message, target, error) =>
    log.error({ action: "db.startup", message, target, errorName: error.name }),
}: PrepareDatabaseStartupOptions): Promise<void> {
  const target = describeTarget(databaseUrl);
  const label = `${target.host}:${target.port}/${target.database}`;

  logInfo("Preparing database startup", target);

  try {
    await waitForDatabase();
  } catch (error) {
    logError(
      "Database readiness check failed",
      target,
      error instanceof Error ? error : new Error(String(error)),
    );
    throw new Error(
      `Database startup failed for ${label}. Check DATABASE_URL and that the database is reachable from this process.`,
    );
  }

  try {
    await runStartupMigrations();
  } catch (error) {
    logError(
      "Database migrations failed",
      target,
      error instanceof Error ? error : new Error(String(error)),
    );
    throw new Error(`Database migrations failed for ${label}.`);
  }
}
