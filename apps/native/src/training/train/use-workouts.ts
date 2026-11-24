import { watchWorkouts, type WorkoutSummary } from "@workspace/sync";
import { useCallback } from "react";
import { useIsOnline } from "@/platform/network";
import { useSyncValue } from "@/sync";
import { useLocalWatch } from "@/platform/local-watch/use-local-watch";
import { firstSyncWait, trainStatus } from "./train-status";
const NONE: WorkoutSummary[] = [];
export function useWorkouts(includeProgramWorkouts = false) {
  const wait = useSyncValue(firstSyncWait);
  const online = useIsOnline();
  const subscribe = useCallback(
    (
      database: Parameters<typeof watchWorkouts>[0],
      onValue: (value: WorkoutSummary[]) => void,
      onError: () => void,
    ) => watchWorkouts(database, { onWorkouts: onValue, onError }, { includeProgramWorkouts }),
    [includeProgramWorkouts],
  );
  const state = useLocalWatch(subscribe);
  const workouts = state.value ?? NONE;
  return {
    workouts,
    retry: state.retry,
    status: trainStatus({
      failed: state.failed,
      loading: state.loading,
      count: workouts.length,
      wait,
      online,
    }),
  };
}
