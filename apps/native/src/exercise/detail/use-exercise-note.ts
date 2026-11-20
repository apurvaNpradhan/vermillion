import { watchExerciseNote } from "@workspace/sync";
import { useCallback } from "react";

import { useLocalWatch } from "@/platform/local-watch/use-local-watch";

/** The exercise's pinned note, read from the device: `value` is null when it has none. */
export function useExerciseNote(exerciseId: string) {
  const subscribe = useCallback(
    (
      database: Parameters<typeof watchExerciseNote>[0],
      onValue: (note: string | null) => void,
      onError: () => void,
    ) => watchExerciseNote(database, exerciseId, { onValue, onError }),
    [exerciseId],
  );
  return useLocalWatch(subscribe);
}
