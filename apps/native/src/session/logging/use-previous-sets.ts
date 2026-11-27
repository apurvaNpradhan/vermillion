import { useWeight } from "@/body";
import { useLocalData, useSyncValue } from "@/sync";
import { watchExerciseHistories, type FinishedSession } from "@workspace/sync";
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";

import { createSharedWatch } from "@/platform/local-watch/shared-watch";

type Database = Parameters<typeof watchExerciseHistories>[0];

/** The finished Sessions of each exercise, newest first (what Previous and the Ghosts read). */
export type PreviousSets = ReadonlyMap<string, readonly FinishedSession[]>;

const EMPTY: PreviousSets = new Map();
const LOADING = { value: undefined, failed: false };
const noop = () => undefined;
const keyOf = (scope: string, ids: readonly string[]) =>
  [scope, ...[...new Set(ids)].sort()].join("|");

const histories = createSharedWatch<Database, PreviousSets>({
  start: (database, key, onValue, onError) =>
    watchExerciseHistories(database, key.split("|").slice(1), {
      onHistories: onValue,
      onError,
    }),
});

/** Starts Previous before a workout switch. On close, give the new screen time to subscribe. */
export function warmPreviousSets(
  database: Database,
  scope: string,
  exerciseIds: readonly string[],
): () => void {
  if (exerciseIds.length === 0) return noop;
  const stop = histories.subscribe(database, keyOf(scope, exerciseIds), noop);
  return () => {
    setTimeout(stop, 5000);
  };
}

/** Previous for every exercise of a Session, live; empty until the histories have loaded. */
export function usePreviousSets(exerciseIds: readonly string[]) {
  const local = useLocalData();
  const database = local?.status === "ready" ? local.database : null;
  const scope = useSyncValue((snapshot) => snapshot?.writeScope ?? null);
  // A database is reused when its owner changes. Scope separates watch results across accounts.
  const key = useMemo(() => (scope ? keyOf(scope, exerciseIds) : null), [scope, exerciseIds]);
  const subscribe = useCallback(
    (listener: () => void) =>
      database && key ? histories.subscribe(database, key, listener) : noop,
    [database, key],
  );
  const state = useSyncExternalStore(subscribe, () =>
    database && key ? histories.snapshot(database, key) : LOADING,
  );
  const failed = local?.status === "unavailable" || state.failed;
  const loading = !failed && state.value === undefined;
  const retry = useCallback(() => {
    if (database && key) histories.retry(database, key);
  }, [database, key]);
  const { withBodyweight, bodyweightOn } = useWeight();
  const cached = useRef<{ scope: string; history: PreviousSets } | null>(null);
  useEffect(() => {
    if (scope && state.value) cached.current = { scope, history: state.value };
    else if (scope === null || failed) cached.current = null;
  }, [scope, state.value, failed]);
  // Only retain histories belonging to the current account's write scope.
  const history = failed
    ? EMPTY
    : (state.value ?? (scope && cached.current?.scope === scope ? cached.current.history : EMPTY));
  const enriched = useMemo(
    () => new Map([...history].map(([id, sessions]) => [id, withBodyweight(sessions)])),
    [history, withBodyweight],
  );
  return {
    history: enriched,
    bodyweightOn,
    ready: !loading && !failed,
    loading,
    failed,
    retry,
  };
}
