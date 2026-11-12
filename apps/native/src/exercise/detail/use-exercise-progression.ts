import { useCallback } from "react";
import {
  suggestNext,
  type Equipment,
  type ExerciseType,
  type PlannedSet,
  type SessionHistory,
  type IncrementSettings,
} from "@workspace/shared";
import { watchLatestExercisePlan } from "@workspace/sync";
import { useLocalWatch } from "@/platform/local-watch/use-local-watch";

export function useExerciseProgression(
  exerciseId: string,
  type: ExerciseType,
  equipment: Equipment,
  sessions: readonly SessionHistory[],
  settings: IncrementSettings,
) {
  const subscribe = useCallback(
    (
      database: Parameters<typeof watchLatestExercisePlan>[0],
      onValue: (sets: PlannedSet[] | null) => void,
      onError: () => void,
    ) => watchLatestExercisePlan(database, exerciseId, { onPlan: onValue, onError }),
    [exerciseId],
  );
  const plan = useLocalWatch(subscribe);
  const sets = plan.value;
  const suggestion = sets
    ? suggestNext(
        sets,
        sessions.slice(0, 2).map((session) => session.sets),
        type,
        equipment,
        settings,
      )
    : null;
  return { sets, suggestion };
}
