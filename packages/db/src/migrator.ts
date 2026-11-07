import { migrate } from "drizzle-orm/node-postgres/migrator";
import { fileURLToPath } from "node:url";

import type { DatabaseConnection } from "./index";
import { relations } from "./relations";
import { drizzle } from "drizzle-orm/node-postgres";

/** Generated SQL migrations. Verticals contribute tables; drizzle-kit collects them. */
export const migrationsFolder = fileURLToPath(new URL("./migrations", import.meta.url));

/** Serializes concurrent migrators (a rolling deploy overlaps old and new containers). */
const MIGRATION_LOCK_KEYS = [0x6d696772, 1] as const;

/**
 * Applies pending migrations. Migrations are additive only: a release adds
 * columns and tables, a later release removes what is no longer used, so the
 * previous container keeps working while a rolling deploy replaces it.
 *
 * drizzle's migrator takes no lock of its own (checked in 1.0.0-rc.5: it reads
 * the applied list, then runs the pending ones in a transaction), so two
 * overlapping runners could both try the same migration. A session advisory
 * lock held on a dedicated connection makes the second one wait, then find
 * nothing left to do.
 */
export async function runMigrations(
  { pool }: Pick<DatabaseConnection, "pool">,
  folder = migrationsFolder,
) {
  const lock = await pool.connect();
  try {
    await lock.query("SELECT pg_advisory_lock($1, $2)", [...MIGRATION_LOCK_KEYS]);
    await migrate(drizzle({ client: pool, relations }), { migrationsFolder: folder });
  } finally {
    // Released with the session; the explicit unlock keeps a pooled connection clean.
    await lock
      .query("SELECT pg_advisory_unlock($1, $2)", [...MIGRATION_LOCK_KEYS])
      .catch(() => undefined);
    lock.release();
  }
}
