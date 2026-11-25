import { useCallback } from "react";
import {
  historyForGym,
  suggestNext,
  type Equipment,
  type ExerciseType,
  type PlannedSet,
  type SessionHistory,
  type IncrementSettings,
} from "@workspace/shared";
import {
  watchExerciseAutoWarmups,
  watchExerciseProgressionMode,
  watchLatestExercisePlan,
} from "@workspace/sync";
import { useLocalWatch } from "@/platform/local-watch/use-local-watch";
import { useGymLoads } from "@/gym";
import { usePreference } from "@/preferences";

export function useExerciseProgressionMode(exerciseId: string) {
  const subscribe = useCallback(
    (
      database: Parameters<typeof watchExerciseProgressionMode>[0],
      onValue: (perSet: boolean) => void,
      onError: () => void,
    ) => watchExerciseProgressionMode(database, exerciseId, { onMode: onValue, onError }),
    [exerciseId],
  );
  return useLocalWatch(subscribe);
}

export function useExerciseAutoWarmups(exerciseId: string) {
  const subscribe = useCallback(
    (
      database: Parameters<typeof watchExerciseAutoWarmups>[0],
      onValue: (on: boolean) => void,
      onError: () => void,
    ) => watchExerciseAutoWarmups(database, exerciseId, { onValue, onError }),
    [exerciseId],
  );
  return useLocalWatch(subscribe);
}

export function useExerciseProgression(
  exerciseId: string,
  type: ExerciseType,
  equipment: Equipment,
  sessions: readonly SessionHistory[],
  settings: IncrementSettings,
  gymId?: string | null,
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
  const gym = useGymLoads(gymId);
  const lighterWeeks = usePreference((preferences) => preferences.ui.lighterWeeks);
  const sets = plan.value;
  const suggestion = sets
    ? suggestNext(sets, sessions, type, equipment, settings, {
        now: new Date(),
        baselineHistory: historyForGym(sessions, gym.gymId, equipment),
        lighterWeeks,
        grid: gym.gridFor(exerciseId, equipment),
      })
    : null;
  return { sets, suggestion };
}
