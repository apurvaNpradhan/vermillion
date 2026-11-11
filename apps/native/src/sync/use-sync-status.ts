import type { SyncSnapshot } from "@workspace/sync";
import { useSyncExternalStore } from "react";

import { useLocalData } from "./use-local-data";

const noSubscription = () => () => undefined;
const noSnapshot = () => null;

/**
 * Sync state for the UI: the indicator (connected, uploading, paused, locked, update-required),
 * unsent count, when something first started waiting and the last successful sync.
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

/**
 * One value read from the sync state, re-rendering only when that value changes. The state
 * changes several times on every write (pending count, upload progress), so a screen that needs
 * only the write scope or a flag reads it here instead of through `useSyncStatus`.
 */
export function useSyncValue<T extends string | number | boolean | null>(
  select: (snapshot: SyncSnapshot | null) => T,
): T {
  const local = useLocalData();
  const lifecycle = local?.status === "ready" ? local.lifecycle : null;
  return useSyncExternalStore(
    lifecycle ? lifecycle.subscribe : noSubscription,
    () => select(lifecycle ? lifecycle.getSnapshot() : null),
    () => select(null),
  );
}
