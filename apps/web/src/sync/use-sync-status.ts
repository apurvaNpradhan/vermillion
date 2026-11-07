import type { SyncSnapshot } from "@workspace/sync";
import { useSyncExternalStore } from "react";

import { useLocalData } from "./use-local-data";

const noSubscription = () => () => undefined;
const noSnapshot = () => null;

/**
 * Sync state for the UI: the indicator (connected, uploading, paused, locked, update-required),
 * the number of unsent changes and when something first started waiting, and the last
 * successful sync. `status` is `loading` until the database is open.
 */
export function useSyncStatus() {
  const local = useLocalData();
  const lifecycle = local?.status === "ready" ? local.lifecycle : null;
  const snapshot: SyncSnapshot | null = useSyncExternalStore(
    lifecycle ? lifecycle.subscribe : noSubscription,
    lifecycle ? lifecycle.getSnapshot : noSnapshot,
    noSnapshot,
  );
  return {
    status: local === null ? ("loading" as const) : local.status,
    snapshot,
    /** Unsent changes right now; ask before an explicit sign-out. */
    countUnsent: async () => (lifecycle ? lifecycle.countUnsent() : 0),
    /** Only after the user confirmed, with the unsent count in front of them. */
    discardAndSwitch: async () => {
      await lifecycle?.discardAndSwitch();
    },
  };
}
