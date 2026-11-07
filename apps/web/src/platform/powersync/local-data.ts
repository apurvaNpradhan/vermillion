import {
  createSyncLifecycle,
  uploadColumns,
  type OpenDatabaseResult,
  type StorageUnavailableReason,
  type SyncLifecycle,
  type SyncTransport,
} from "@workspace/sync";

import { appConfig } from "../app-config";
import { client } from "../orpc";
import { openWebDatabase } from "./database";

type OpenDatabase = Extract<OpenDatabaseResult, { status: "ready" }>["database"];

export type LocalData =
  | { status: "ready"; database: OpenDatabase; lifecycle: SyncLifecycle }
  | { status: "unavailable"; reason: StorageUnavailableReason };

/** The two sync procedures over the same-origin oRPC client (ADR 0017, 0018). */
const transport: SyncTransport = {
  credentials: () => client.sync.credentials(),
  upload: (request) => client.sync.upload(request),
};

const LOCK_NAME = `${appConfig.name}-sync-lifecycle`;

/**
 * One transition at a time across every tab of this origin. Without Web Locks (old browsers) the
 * transition still runs; the shared worker keeps a single database either way.
 */
function exclusive<T>(work: () => Promise<T>): Promise<T> {
  return typeof navigator !== "undefined" && "locks" in navigator
    ? navigator.locks.request(LOCK_NAME, work)
    : work();
}

function createChannel() {
  const channel = new BroadcastChannel(LOCK_NAME);
  return {
    post: () => channel.postMessage("changed"),
    subscribe(listener: () => void) {
      channel.addEventListener("message", listener);
      return () => channel.removeEventListener("message", listener);
    },
  };
}

let opening: Promise<LocalData> | undefined;

/**
 * The page's local database plus its sync lifecycle, started once. Resolves to an explicit
 * unavailable state when the browser cannot keep data on this device.
 */
export function openLocalData(): Promise<LocalData> {
  opening ??= (async (): Promise<LocalData> => {
    const result = await openWebDatabase();
    if (result.status === "unavailable") return result;
    const lifecycle = createSyncLifecycle({
      database: result.database,
      transport,
      uploadColumns,
      exclusive,
      channel: createChannel(),
    });
    await lifecycle.start();
    return { status: "ready", database: result.database, lifecycle };
  })();
  return opening;
}
