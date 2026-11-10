import { SessionLimitError, TrainingLimitError, type TrainingDatabase } from "@workspace/sync";
import { useToast } from "heroui-native";
import { useCallback } from "react";

import { useTranslation } from "@/platform/i18n";
import { useLocalData, useSyncStatus } from "@/sync";

import { useTrainingPreferences } from "./use-training-preferences";

/** How long a toast offers Undo. */
export const UNDO_MS = 5000;

const LIMIT_KEYS = {
  exercisesPerWorkout: "training__limit_exercises",
  liveWorkouts: "training__limit_workouts",
  livePrograms: "training__limit_programs",
  slotsPerProgram: "training__limit_slots",
} as const;

const SESSION_LIMIT_KEYS = {
  exercisesPerSession: "session__limit_exercises",
  setsPerExercise: "session__limit_sets",
} as const;

function limitMessage(error: Error) {
  if (error instanceof SessionLimitError) return SESSION_LIMIT_KEYS[error.limit];
  if (!(error instanceof TrainingLimitError)) return null;
  if (error.limit === "exercisesPerWorkout") return LIMIT_KEYS.exercisesPerWorkout;
  if (error.limit === "liveWorkouts") return LIMIT_KEYS.liveWorkouts;
  if (error.limit === "livePrograms") return LIMIT_KEYS.livePrograms;
  if (error.limit === "slotsPerProgram") return LIMIT_KEYS.slotsPerProgram;
  return null;
}

/**
 * What every training write needs: the local database, the write scope of this device account, the
 * user's defaults, a `write` that toasts a failure (or a reached limit) and resolves to the
 * fallback so a screen never has to catch, and an Undo toast.
 */
export function useTrainingWrite() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const local = useLocalData();
  const { snapshot } = useSyncStatus();
  const { defaultRestSeconds } = useTrainingPreferences();
  const writeScope = snapshot?.writeScope ?? "";
  const database = local?.status === "ready" ? local.database : null;

  const write = useCallback(
    async <R>(action: (db: TrainingDatabase) => Promise<R>, fallback: R): Promise<R> => {
      try {
        if (!database) throw new Error("Local storage is not available");
        return await action(database);
      } catch (error) {
        const limit = error instanceof Error ? limitMessage(error) : null;
        toast.show({ variant: "danger", label: t(limit ?? "errors__unknown") });
        return fallback;
      }
    },
    [database, t, toast],
  );
  const training = useCallback(() => ({ defaultRestSeconds }), [defaultRestSeconds]);

  const undoToast = useCallback(
    (label: string, undo: () => void) =>
      toast.show({
        label,
        actionLabel: t("common__undo"),
        duration: UNDO_MS,
        onActionPress: ({ hide }) => {
          hide();
          undo();
        },
      }),
    [t, toast],
  );

  return { write, writeScope, training, undoToast };
}
