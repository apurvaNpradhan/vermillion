import { watchWorkout, type WorkoutDetail } from "@workspace/sync";
import { useEffect, useState } from "react";

import { useLocalData } from "@/sync";

export type WorkoutState =
  | { status: "loading" }
  | { status: "ready"; workout: WorkoutDetail }
  | { status: "missing" }
  | { status: "error" };

/** One Workout with its exercises in order. `missing` once it is deleted (or on another device). */
export function useWorkout(id: string): WorkoutState {
  const local = useLocalData();
  const database = local?.status === "ready" ? local.database : null;
  const [result, setResult] = useState<{ id: string; state: WorkoutState } | null>(null);

  useEffect(() => {
    if (!database) return;
    return watchWorkout(database, id, {
      onWorkout: (workout) =>
        setResult({
          id,
          state: workout ? { status: "ready", workout } : { status: "missing" },
        }),
      onError: () => setResult({ id, state: { status: "error" } }),
    });
  }, [database, id]);

  if (local?.status === "unavailable") return { status: "error" };
  return result?.id === id ? result.state : { status: "loading" };
}
