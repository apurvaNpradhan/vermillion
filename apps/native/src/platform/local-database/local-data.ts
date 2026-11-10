import {
  createSyncLifecycle,
  SYNCED_TABLE_NAMES,
  ensureInstallId,
  purgeOrphanRejectedWrites,
  powerSyncSchema,
  sweepProgramCovers,
  uploadColumns,
  type StorageUnavailableReason,
  type SyncLifecycle,
  type SyncTransport,
} from "@workspace/sync";

import { deleteCoversExcept } from "../media/cover-files";
import { client } from "../orpc";
import { openNativeDatabase } from "./native-database";

type OpenDatabase = Awaited<ReturnType<typeof openNativeDatabase>>;

export type LocalData =
  | { status: "ready"; database: OpenDatabase; lifecycle: SyncLifecycle }
  | { status: "unavailable"; reason: StorageUnavailableReason };

/** The two sync procedures over the app's oRPC client (ADR 0017, 0018). */
const transport: SyncTransport = {
  credentials: () => client.sync.credentials(),
  upload: (request) => client.sync.upload(request),
};

// Fast Refresh re-evaluates modules; the database and all watches must retain one owner.
declare global {
  var vermillionLocalData: Promise<LocalData> | undefined;
}

/**
 * The app's encrypted local database plus its sync lifecycle, started once per app start. A
 * database that cannot be opened is reported, never replaced by an in-memory one.
 */
export function openLocalData(): Promise<LocalData> {
  globalThis.vermillionLocalData ??= (async (): Promise<LocalData> => {
    try {
      const database = await openNativeDatabase(powerSyncSchema);
      await database.init();
      await ensureInstallId(database);
      // Rejections of tables that no longer sync (notes) have no screen and cannot be retried.
      await purgeOrphanRejectedWrites(database, SYNCED_TABLE_NAMES);
      // Cover files of Programs that are gone (deleted past Undo, on another device, or by a
      // wipe that was interrupted) are deleted; a failure only leaves them for the next start.
      await sweepProgramCovers(database)
        .then((kept) => deleteCoversExcept(kept))
        .catch(() => undefined);
      const lifecycle = createSyncLifecycle({
        database,
        transport,
        uploadColumns,
        // Cover photos are files outside the database: they go with the account.
        onWiped: async () => deleteCoversExcept([]),
      });
      await lifecycle.start();
      return { status: "ready", database, lifecycle };
    } catch {
      return { status: "unavailable", reason: "open-failed" };
    }
  })();
  return globalThis.vermillionLocalData;
}
