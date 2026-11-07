import { migrate } from "drizzle-orm/node-postgres/migrator";
import { fileURLToPath } from "node:url";

import type { DatabaseConnection } from "./index";
import { relations } from "./relations";
import { drizzle } from "drizzle-orm/node-postgres";

/** Generated SQL migrations. Verticals contribute tables; drizzle-kit collects them. */
export const migrationsFolder = fileURLToPath(new URL("./migrations", import.meta.url));

/**
 * Applies pending migrations. Migrations are additive only: a release adds
 * columns and tables, a later release removes what is no longer used, so the
 * previous container keeps working while a rolling deploy replaces it.
 */
export async function runMigrations(
  { pool }: Pick<DatabaseConnection, "pool">,
  folder = migrationsFolder,
) {
  await migrate(drizzle({ client: pool, relations }), { migrationsFolder: folder });
}
