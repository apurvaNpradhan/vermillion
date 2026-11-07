import {
  createSyncLifecycle,
  ensureInstallId,
  powerSyncSchema,
  uploadColumns,
  type StorageUnavailableReason,
  type SyncLifecycle,
  type SyncTransport,
} from "@workspace/sync";

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

let opening: Promise<LocalData> | undefined;

/**
 * The app's encrypted local database plus its sync lifecycle, started once per app start. A
 * database that cannot be opened is reported, never replaced by an in-memory one.
 */
export function openLocalData(): Promise<LocalData> {
  opening ??= (async (): Promise<LocalData> => {
    try {
      const database = await openNativeDatabase(powerSyncSchema);
      await database.init();
      await ensureInstallId(database);
      const lifecycle = createSyncLifecycle({
        database,
        transport,
        uploadColumns,
        // One process owns the database, and the lifecycle already queues its transitions.
        exclusive: (work) => work(),
        channel: { post: () => undefined, subscribe: () => () => undefined },
      });
      await lifecycle.start();
      return { status: "ready", database, lifecycle };
    } catch {
      return { status: "unavailable", reason: "open-failed" };
    }
  })();
  return opening;
}
