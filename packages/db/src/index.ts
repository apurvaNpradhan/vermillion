import { drizzle } from "drizzle-orm/node-postgres";
import type { PgAsyncDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { Pool } from "pg";

import { relations } from "./relations";

/**
 * The database handle verticals use. It is the node-postgres driver's database, kept as a
 * base type so operations do not depend on the concrete driver.
 */
export type Database = PgAsyncDatabase<PgQueryResultHKT, typeof relations>;

export type DatabaseConnection = { db: Database; pool: Pool };

export function createDb(databaseUrl: string): DatabaseConnection {
  const pool = new Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    max: 10,
    // Timestamps are UTC instants; never depend on the server's time zone.
    options: "-c timezone=UTC",
  });
  return { db: drizzle({ client: pool, relations }), pool };
}

export { relations };
