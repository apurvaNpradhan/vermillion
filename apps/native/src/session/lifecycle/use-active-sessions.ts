import { watchActiveSessions, type ActiveSession } from "@workspace/sync";
import { useCallback, useMemo, useSyncExternalStore } from "react";

import { createSharedWatch } from "@/platform/local-watch/shared-watch";
import { useLocalData } from "@/sync";

const NONE: ActiveSession[] = [];
type Database = Parameters<typeof watchActiveSessions>[0];

/** One watch for every reader: the Resume bar, the hosts and the Train screens. */
const activeSessions = createSharedWatch<Database, ActiveSession[]>({
  start: (database, _key, onValue, onError) =>
    watchActiveSessions(database, { onSessions: onValue, onError }),
});
const KEY = "active";
const LOADING = { value: undefined, failed: false };

/** The unfinished Sessions, newest first. There is normally one; two started offline are both listed. */
export function useActiveSessions() {
  const local = useLocalData();
  const database = local?.status === "ready" ? local.database : null;
  const subscribe = useCallback(
    (listener: () => void) =>
      database ? activeSessions.subscribe(database, KEY, listener) : () => undefined,
    [database],
  );
  const state = useSyncExternalStore(subscribe, () =>
    database ? activeSessions.snapshot(database, KEY) : LOADING,
  );
  const failed = local?.status === "unavailable" || state.failed;
  return useMemo(
    () => ({
      sessions: state.value ?? NONE,
      loading: !failed && state.value === undefined,
      failed,
    }),
    [state, failed],
  );
}
