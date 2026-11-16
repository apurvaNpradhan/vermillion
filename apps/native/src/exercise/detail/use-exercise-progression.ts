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
import { usePreferences } from "@/preferences";

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
  const { preferences } = usePreferences();
  const sets = plan.value;
  const suggestion = sets
    ? suggestNext(sets, sessions, type, equipment, settings, {
        now: new Date(),
        lighterWeeks: preferences.ui.lighterWeeks,
      })
    : null;
  return { sets, suggestion };
}
