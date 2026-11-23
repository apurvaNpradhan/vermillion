import { watchSession, type SessionDetail } from "@workspace/sync";
import { useCallback, useMemo, useSyncExternalStore } from "react";

import { createSharedWatch } from "@/platform/local-watch/shared-watch";
import { useLocalData } from "@/sync";

import { shareSession } from "./share-session";

export type SessionState =
  | { status: "loading" }
  | { status: "ready"; session: SessionDetail }
  | { status: "missing" }
  | { status: "error"; retry: () => void };

type Database = Parameters<typeof watchSession>[0];

/**
 * One watch and one parse per Session id for every hook that reads it, so the screen, the Resume
 * bar and the Live notification do not each re-run the query when a set is written. The shared
 * value keeps unchanged exercises and sets as the same objects.
 */
const sessions = createSharedWatch<Database, SessionDetail | null>({
  start: (database, id, onValue, onError) =>
    watchSession(database, id, { onSession: onValue, onError }),
  share: (previous, next) => (next && previous ? shareSession(previous, next) : next),
});
const LOADING = { value: undefined, failed: false };
const NOTHING = () => undefined;

/** One Session with its exercises and sets, live from the local database. */
export function useSession(id: string): SessionState {
  const local = useLocalData();
  const database = local?.status === "ready" ? local.database : null;
  const subscribe = useCallback(
    (listener: () => void) => (database ? sessions.subscribe(database, id, listener) : NOTHING),
    [database, id],
  );
  const state = useSyncExternalStore(subscribe, () =>
    database ? sessions.snapshot(database, id) : LOADING,
  );
  const retry = useCallback(() => {
    if (database) sessions.retry(database, id);
  }, [database, id]);
  const unavailable = local?.status === "unavailable";
  return useMemo((): SessionState => {
    if (unavailable || state.failed) return { status: "error", retry };
    if (state.value === undefined) return { status: "loading" };
    return state.value === null ? { status: "missing" } : { status: "ready", session: state.value };
  }, [unavailable, state, retry]);
}
