import { drizzle } from "drizzle-orm/node-postgres";
import type { PgAsyncDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { Pool } from "pg";

import { relations } from "./relations";

/**
 * The database handle verticals use. It is the node-postgres driver's database, kept as a
 * base type so operations do not depend on the concrete driver.
 */
export type Database = PgAsyncDatabase<PgQueryResultHKT, typeof relations>;

/** The handle inside `db.transaction(...)`; it also nests, as a savepoint. */
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** What an operation accepts: the database, or a transaction the caller already opened. */
export type DbExecutor = Database | Transaction;

export type DatabaseConnection = { db: Database; pool: Pool };

export function createDb(
  databaseUrl: string,
  { max = 10 }: { max?: number } = {},
): DatabaseConnection {
  const pool = new Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    max,
    // Timestamps are UTC instants; never depend on the server's time zone.
    options: "-c timezone=UTC",
  });
  // A Postgres restart or failover kills idle pooled connections. Without a listener the
  // pool's 'error' event is an uncaught exception that takes the process down. The pool
  // discards the dead client and reconnects on the next query; callers may log via pool.on.
  pool.on("error", () => undefined);
  return { db: drizzle({ client: pool, relations }), pool };
}

export { relations };
