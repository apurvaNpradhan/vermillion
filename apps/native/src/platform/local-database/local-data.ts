import {
  createSyncLifecycle,
  SYNCED_TABLE_NAMES,
  ensureInstallId,
  purgeOrphanRejectedWrites,
  powerSyncSchema,
  uploadColumns,
  type StorageUnavailableReason,
  type SyncLifecycle,
  type SyncTransport,
} from "@workspace/sync";

import { createMediaQueue, deleteLegacyCovers, sendToBucket, type MediaQueue } from "../../media";
import { client } from "../orpc";
import { openNativeDatabase } from "./native-database";

type OpenDatabase = Awaited<ReturnType<typeof openNativeDatabase>>;

export type LocalData =
  | { status: "ready"; database: OpenDatabase; lifecycle: SyncLifecycle; media: MediaQueue }
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
      // The local-only covers of before user media (ADR 0036) are not migrated: their folder goes
      // once; a failure only leaves it for the next start.
      deleteLegacyCovers();
      const media = createMediaQueue(database, client.media, sendToBucket);
      const lifecycle = createSyncLifecycle({
        database,
        transport,
        uploadColumns,
        // Media files are outside the database: they go with the account.
        onWiped: () => media.clear(),
      });
      await lifecycle.start();
      // Files move only while the owner's data is on the device and sync may run: started after
      // connect, stopped on sign-out and when the device switches accounts.
      const follow = () => {
        const active = lifecycle.getSnapshot().phase.kind === "active";
        void (active ? media.start() : media.stop()).catch(() => undefined);
      };
      lifecycle.subscribe(follow);
      follow();
      return { status: "ready", database, lifecycle, media };
    } catch {
      return { status: "unavailable", reason: "open-failed" };
    }
  })();
  return globalThis.vermillionLocalData;
}
