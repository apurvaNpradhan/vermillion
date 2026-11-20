import { useWeight } from "@/body";
import { useLocalData, useSyncValue } from "@/sync";
import { readRecordHistory, watchExerciseHistories, type FinishedSession } from "@workspace/sync";
import { useCallback, useEffect, useRef } from "react";

import { useLocalWatch } from "@/platform/local-watch/use-local-watch";

type Database = Parameters<typeof watchExerciseHistories>[0];

/** The finished Sessions of each exercise, newest first (what Previous and the Ghosts read). */
export type PreviousSets = ReadonlyMap<string, readonly FinishedSession[]>;

const EMPTY: PreviousSets = new Map();

/**
 * Subscribes to the history of every exercise in `exerciseIds`, in one query, and reports one map
 * whenever any of them changes. The ids are a set: order and repeats do not resubscribe.
 */
export function watchHistories(
  database: Database,
  exerciseIds: readonly string[],
  onValue: (history: PreviousSets) => void,
  onError: () => void,
): () => void {
  return watchExerciseHistories(database, exerciseIds, { onHistories: onValue, onError });
}

/** Previous for every exercise of a Session, live; empty until the histories have loaded. */
export function usePreviousSets(exerciseIds: readonly string[]) {
  const key = [...new Set(exerciseIds)].sort().join("|");
  const subscribe = useCallback(
    (database: Database, onValue: (history: PreviousSets) => void, onError: () => void) =>
      watchHistories(database, key === "" ? [] : key.split("|"), onValue, onError),
    [key],
  );
  const state = useLocalWatch(subscribe);
  const weight = useWeight();
  const scope = useSyncValue((snapshot) => snapshot?.writeScope ?? null);
  const cached = useRef<{ scope: string; history: PreviousSets } | null>(null);
  useEffect(() => {
    if (scope && state.value) cached.current = { scope, history: state.value };
    else if (scope === null || state.failed) cached.current = null;
  }, [scope, state.value, state.failed]);
  // Only retain histories belonging to the current account's write scope.
  const history = state.failed
    ? EMPTY
    : (state.value ?? (scope && cached.current?.scope === scope ? cached.current.history : EMPTY));
  const local = useLocalData();
  const database = local?.status === "ready" ? local.database : null;
  const { withBodyweight } = weight;
  /**
   * An exercise's whole finished history, read when a Record is checked: Previous above keeps the
   * latest 500 Sessions, but the finished Session and History screens compare with all of them,
   * so a live alert must too. Null when it cannot be read (the caller falls back to Previous).
   */
  const recordHistory = useCallback(
    async (exerciseId: string): Promise<readonly FinishedSession[] | null> => {
      if (!database) return null;
      try {
        return withBodyweight(await readRecordHistory(database, exerciseId));
      } catch {
        return null;
      }
    },
    [database, withBodyweight],
  );
  return {
    recordHistory,
    history: new Map([...history].map(([id, sessions]) => [id, weight.withBodyweight(sessions)])),
    bodyweightOn: weight.bodyweightOn,
    ready: !state.loading && !state.failed,
    failed: state.failed,
    retry: state.retry,
  };
}
