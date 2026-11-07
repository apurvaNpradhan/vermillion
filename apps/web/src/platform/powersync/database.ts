import {
  ensureInstallId,
  powerSyncSchema,
  type DatabaseFactory,
  type OpenDatabaseResult,
} from "@workspace/sync";

import { appConfig } from "../app-config";
import { detectStorage, requestPersistentStorage } from "./storage-support";

/**
 * Web database factory (ADR 0020): `@powersync/web` on `OPFSCoopSyncVFS`, multi-tab through the
 * shared worker. Importing `@powersync/web` is deferred so server rendering and pages that never
 * touch local data do not load it.
 */
export const webDatabaseFactory: DatabaseFactory = {
  async open(): Promise<OpenDatabaseResult> {
    const unavailable = await detectStorage();
    if (unavailable) return { status: "unavailable", reason: unavailable };
    // Fire and forget: the answer only affects eviction, never whether we can open.
    void requestPersistentStorage();
    try {
      const { PowerSyncDatabase, WASQLiteVFS } = await import("@powersync/web");
      const database = new PowerSyncDatabase({
        schema: powerSyncSchema,
        database: { dbFilename: `${appConfig.name}.db`, vfs: WASQLiteVFS.OPFSCoopSyncVFS },
      });
      await database.init();
      await ensureInstallId(database);
      return { status: "ready", database };
    } catch {
      return { status: "unavailable", reason: "open-failed" };
    }
  },
};

let opening: Promise<OpenDatabaseResult> | undefined;

/**
 * One database per page. Opening is memoised (React Strict Mode and route remounts would otherwise
 * release the shared worker out from under a live database). A failed open is not retried until reload.
 */
export function openWebDatabase(): Promise<OpenDatabaseResult> {
  opening ??= webDatabaseFactory.open();
  return opening;
}
