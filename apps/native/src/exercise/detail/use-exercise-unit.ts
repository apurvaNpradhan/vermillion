import { useCallback } from "react";
import { watchExerciseUnit, type TrainingDatabase } from "@workspace/sync";
import type { WeightUnit } from "@workspace/shared";

import { useLocalWatch } from "@/platform/local-watch/use-local-watch";

export function useExerciseUnit(exerciseId: string) {
  const subscribe = useCallback(
    (db: TrainingDatabase, onValue: (unit: WeightUnit | null) => void, onError: () => void) =>
      watchExerciseUnit(db, exerciseId, { onUnit: onValue, onError }),
    [exerciseId],
  );
  return useLocalWatch(subscribe);
}
