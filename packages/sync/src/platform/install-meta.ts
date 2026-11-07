import type { AbstractPowerSyncDatabase } from "@powersync/common";
import { v7 as uuidv7 } from "uuid";

const SINGLETON_ID = "install";

/** The narrow slice of the database `ensureInstallId` needs. */
export type InstallMetaDatabase = Pick<AbstractPowerSyncDatabase, "writeTransaction">;

/**
 * The install id (UUIDv7), created the first time the database is opened and stable afterwards.
 * The read-then-insert runs inside one write transaction, so two tabs opening together agree.
 */
export async function ensureInstallId(database: InstallMetaDatabase): Promise<string> {
  return database.writeTransaction(async (tx) => {
    const existing = await tx.getOptional<{ install_id: string }>(
      "SELECT install_id FROM install_meta WHERE id = ?",
      [SINGLETON_ID],
    );
    if (existing) return existing.install_id;
    const installId = uuidv7();
    await tx.execute("INSERT INTO install_meta (id, install_id, created_at) VALUES (?, ?, ?)", [
      SINGLETON_ID,
      installId,
      new Date().toISOString(),
    ]);
    return installId;
  });
}

/** The install id if the database has one yet (read only; `ensureInstallId` creates it). */
export async function readInstallId(
  database: Pick<AbstractPowerSyncDatabase, "getOptional">,
): Promise<string | null> {
  const row = await database.getOptional<{ install_id: string }>(
    "SELECT install_id FROM install_meta WHERE id = ?",
    [SINGLETON_ID],
  );
  return row?.install_id ?? null;
}
