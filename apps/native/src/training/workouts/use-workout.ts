import { watchWorkout, type WorkoutDetail } from "@workspace/sync";
import { useCallback } from "react";
import { useLocalWatch } from "@/platform/local-watch/use-local-watch";
export type WorkoutState =
  | { status: "loading" }
  | { status: "ready"; workout: WorkoutDetail }
  | { status: "missing" }
  | { status: "error"; retry: () => void };
export function useWorkout(id: string): WorkoutState {
  const subscribe = useCallback(
    (
      database: Parameters<typeof watchWorkout>[0],
      onValue: (value: WorkoutDetail | null) => void,
      onError: () => void,
    ) => watchWorkout(database, id, { onWorkout: onValue, onError }),
    [id],
  );
  const state = useLocalWatch(subscribe);
  if (state.failed) return { status: "error", retry: state.retry };
  if (state.loading || state.value === undefined) return { status: "loading" };
  return state.value === null ? { status: "missing" } : { status: "ready", workout: state.value };
}
