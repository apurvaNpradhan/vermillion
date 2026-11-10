import { watchWorkouts, type WorkoutSummary } from "@workspace/sync";
import { useCallback, useEffect, useState } from "react";

import { useLocalData, useSyncStatus } from "@/sync";

import { trainStatus, type TrainStatus } from "./train-status";

const NONE: WorkoutSummary[] = [];

/** The standalone Workouts, newest first, from the local database, and what the list can say. */
export function useWorkouts() {
  const local = useLocalData();
  const { snapshot } = useSyncStatus();
  const database = local?.status === "ready" ? local.database : null;
  const [workouts, setWorkouts] = useState<WorkoutSummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!database) return;
    return watchWorkouts(database, {
      onWorkouts: (next) => {
        setFailed(false);
        setWorkouts(next);
      },
      onError: () => setFailed(true),
    });
  }, [database, attempt]);

  const retry = useCallback(() => {
    setFailed(false);
    setWorkouts(null);
    setAttempt((current) => current + 1);
  }, []);

  const status: TrainStatus = trainStatus({
    failed: failed || local?.status === "unavailable",
    loading: local === null || (database !== null && workouts === null),
    count: workouts?.length ?? 0,
    snapshot,
  });
  return { status, workouts: workouts ?? NONE, retry };
}
