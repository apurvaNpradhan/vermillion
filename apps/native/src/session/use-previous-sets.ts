import { watchExerciseHistory, type FinishedSession } from "@workspace/sync";
import { useCallback } from "react";

import { useLocalWatch } from "@/platform/local-watch/use-local-watch";

type Database = Parameters<typeof watchExerciseHistory>[0];

/** The finished Sessions of each exercise, newest first (what Previous and the Ghosts read). */
export type PreviousSets = ReadonlyMap<string, readonly FinishedSession[]>;

const EMPTY: PreviousSets = new Map();

/**
 * Subscribes to the history of every exercise in `exerciseIds` and reports one map once each has
 * answered, and again whenever any of them changes. The ids are a set: order and repeats do not
 * resubscribe.
 */
export function watchHistories(
  database: Database,
  exerciseIds: readonly string[],
  onValue: (history: PreviousSets) => void,
  onError: () => void,
): () => void {
  const ids = [...new Set(exerciseIds)];
  if (ids.length === 0) {
    onValue(EMPTY);
    return () => undefined;
  }
  const latest = new Map<string, readonly FinishedSession[]>();
  const stops = ids.map((id) =>
    watchExerciseHistory(database, id, {
      onHistory: (sessions) => {
        latest.set(id, sessions);
        if (latest.size === ids.length) onValue(new Map(latest));
      },
      onError,
    }),
  );
  return () => {
    for (const stop of stops) stop();
  };
}

/** Previous for every exercise of a Session, live; empty until the histories have loaded. */
export function usePreviousSets(exerciseIds: readonly string[]): PreviousSets {
  const key = [...new Set(exerciseIds)].sort().join("|");
  const subscribe = useCallback(
    (database: Database, onValue: (history: PreviousSets) => void, onError: () => void) =>
      watchHistories(database, key === "" ? [] : key.split("|"), onValue, onError),
    [key],
  );
  const state = useLocalWatch(subscribe);
  return state.value ?? EMPTY;
}
