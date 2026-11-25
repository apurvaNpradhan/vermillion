import type { AbstractPowerSyncDatabase } from "@powersync/common";
import { getTableName } from "drizzle-orm";
import { z } from "zod";

import { SYNCED_TABLE_NAMES, drizzleSchema } from "./schema";
import { storageRowToWire, type WireRow } from "./row-conversion";

/** Rows one backup read pulls per table page. */
const BACKUP_PAGE = 1000;

const storageRowSchema = z.record(z.string(), z.union([z.string(), z.number(), z.null()]));

/** Every table that holds the user's own data, by name (the synced ones, local-only never). */
const BACKUP_TABLES = Object.values(drizzleSchema).flatMap((table) => {
  const name = getTableName(table);
  return SYNCED_TABLE_NAMES.includes(name) ? [{ name, table }] : [];
});

/** The names of the tables a backup holds, in the order it writes them. */
export const BACKUP_TABLE_NAMES: readonly string[] = BACKUP_TABLES.map((entry) => entry.name);

export type BackupTables = { [table: string]: WireRow[] };

/**
 * Every row the signed-in user owns locally, per table, in one SQLite snapshot: plans, Sessions and
 * sets, body data, media rows, preferences and Custom exercises. The Reference catalog
 * (`user_id IS NULL`) is not the user's and stays out. Values are JSON-safe (booleans, JSON
 * columns decoded). Media files are not included, only their rows.
 */
export function readBackupTables(
  database: Pick<AbstractPowerSyncDatabase, "readTransaction">,
): Promise<BackupTables> {
  return database.readTransaction(async (tx) => {
    const tables: BackupTables = {};
    for (const { name, table } of BACKUP_TABLES) {
      const rows: WireRow[] = [];
      const own = name === "exercise" ? "WHERE user_id IS NOT NULL" : "";
      for (let offset = 0; ; offset += BACKUP_PAGE) {
        const page = z
          .array(storageRowSchema)
          .parse(
            await tx.getAll(`SELECT * FROM "${name}" ${own} ORDER BY id LIMIT ? OFFSET ?`, [
              BACKUP_PAGE,
              offset,
            ]),
          );
        for (const row of page) rows.push(storageRowToWire(table, row));
        if (page.length < BACKUP_PAGE) break;
      }
      tables[name] = rows;
    }
    return tables;
  });
}
