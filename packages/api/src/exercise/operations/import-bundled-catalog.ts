import { createDb, type Database } from "@workspace/db";

import { bundledCatalogText } from "./bundled-catalog";
import { importCatalog, type CatalogImportResult } from "./import-catalog";

/** Imports the committed catalog file; the server runs this after its migrations. */
export function importBundledCatalog(db: Database, force = false): Promise<CatalogImportResult> {
  return importCatalog(db, bundledCatalogText(), force);
}

/** `pnpm --filter server catalog:import`: the same import against a database URL, on its own pool. */
export async function runCatalogImport(
  databaseUrl: string,
  force = false,
): Promise<CatalogImportResult> {
  const { db, pool } = createDb(databaseUrl, { max: 2 });
  try {
    return await importBundledCatalog(db, force);
  } finally {
    await pool.end();
  }
}
