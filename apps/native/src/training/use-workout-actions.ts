import {
  TrainingLimitError,
  addExercises,
  copyWorkout,
  createWorkout,
  deleteWorkout,
  moveWorkoutExercise,
  readExerciseType,
  removeWorkoutExercise,
  replaceExercise,
  restoreWorkout,
  restoreWorkoutExercise,
  updateWorkout,
  updateWorkoutExercise,
  type TrainingDatabase,
  type WorkoutExerciseDetail,
  type WorkoutExercisePatch,
  type WorkoutPatch,
} from "@workspace/sync";
import { EXERCISE_TYPE_KEYS, TRAINING_LIMITS } from "@workspace/shared";
import { useToast } from "heroui-native";
import { useCallback } from "react";

import { haptic } from "@/platform/haptics";
import { useTranslation } from "@/platform/i18n";
import { useLocalData, useSyncStatus } from "@/sync";

import { useTrainingPreferences } from "./use-training-preferences";

/** How long a toast offers Undo. */
const UNDO_MS = 5000;
/** The suffix of a duplicate's title, kept inside the title limit. */
const COPY_SUFFIX = " (copy)";

const LIMIT_KEYS = {
  exercisesPerWorkout: "training__limit_exercises",
  liveWorkouts: "training__limit_workouts",
} as const;

function limitMessage(error: Error) {
  if (!(error instanceof TrainingLimitError)) return null;
  if (error.limit === "exercisesPerWorkout") return LIMIT_KEYS.exercisesPerWorkout;
  if (error.limit === "liveWorkouts") return LIMIT_KEYS.liveWorkouts;
  return null;
}

/**
 * Writes to Workouts and their exercises on the local database: each returns once the change is
 * saved on the device and uploads in the background. A failed write shows a toast and resolves
 * to `null` / `false`, so a screen never has to catch. Deleting and removing offer Undo.
 */
export function useWorkoutActions() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const local = useLocalData();
  const { snapshot } = useSyncStatus();
  const preferences = useTrainingPreferences();
  const writeScope = snapshot?.writeScope ?? "";
  const database = local?.status === "ready" ? local.database : null;
  const { defaultRestSeconds } = preferences;

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

  /** A new Workout holding `exerciseIds` in order. Null if it could not be made. */
  const create = useCallback(
    (exerciseIds: readonly string[]) =>
      write(async (db) => {
        const id = await createWorkout(db, {}, writeScope);
        try {
          await addExercises(db, id, exerciseIds, training(), writeScope);
        } catch (error) {
          await deleteWorkout(db, id, writeScope);
          throw error;
        }
        haptic.confirm();
        return id;
      }, null),
    [write, writeScope, training],
  );

  const append = useCallback(
    (workoutId: string, exerciseIds: readonly string[]) =>
      write(async (db) => {
        await addExercises(db, workoutId, exerciseIds, training(), writeScope);
        haptic.confirm();
        return true;
      }, false),
    [write, writeScope, training],
  );

  const update = useCallback(
    (id: string, patch: WorkoutPatch) =>
      write((db) => updateWorkout(db, id, patch, writeScope), false),
    [write, writeScope],
  );

  const remove = useCallback(
    async (id: string, title: string) => {
      const deleted = await write((db) => deleteWorkout(db, id, writeScope), null);
      if (!deleted) return false;
      haptic.confirm();
      undoToast(t("training__deleted_toast", { title }), () => {
        void write((db) => restoreWorkout(db, deleted, writeScope), false);
      });
      return true;
    },
    [write, writeScope, undoToast, t],
  );

  /** Copies a Workout; `title` is its title, null when derived (the copy then stays derived). */
  const duplicate = useCallback(
    (id: string, title: string | null) =>
      write(async (db) => {
        const copy = await copyWorkout(db, id, null, writeScope);
        if (title !== null) {
          const copied = `${title.slice(0, TRAINING_LIMITS.titleMax - COPY_SUFFIX.length)}${COPY_SUFFIX}`;
          await updateWorkout(db, copy, { title: copied }, writeScope);
        }
        haptic.confirm();
        return copy;
      }, null),
    [write, writeScope],
  );

  const updateExercise = useCallback(
    (id: string, patch: WorkoutExercisePatch) =>
      write((db) => updateWorkoutExercise(db, id, patch, writeScope), false),
    [write, writeScope],
  );

  const move = useCallback(
    (id: string, beforeId: string | null) =>
      write((db) => moveWorkoutExercise(db, id, beforeId, writeScope), false),
    [write, writeScope],
  );

  /** Swaps the exercise of a row; a toast says so when the type changed and targets were reset. */
  const replace = useCallback(
    (entry: WorkoutExerciseDetail, exerciseId: string) =>
      write(async (db) => {
        const [before, after] = await Promise.all([
          readExerciseType(db, entry.exerciseId),
          readExerciseType(db, exerciseId),
        ]);
        const changed = await replaceExercise(db, entry.id, exerciseId, training(), writeScope);
        if (changed && after !== null && before !== after) {
          toast.show({
            label: t("training__targets_reset_toast", { type: t(EXERCISE_TYPE_KEYS[after]) }),
          });
        }
        return changed;
      }, false),
    [write, writeScope, training, toast, t],
  );

  const removeExercise = useCallback(
    async (entry: WorkoutExerciseDetail, title: string) => {
      const removed = await write((db) => removeWorkoutExercise(db, entry.id, writeScope), false);
      if (!removed) return false;
      haptic.confirm();
      undoToast(t("training__removed_toast", { title }), () => {
        void write(
          (db) =>
            restoreWorkoutExercise(
              db,
              {
                id: entry.id,
                workout_id: entry.workoutId,
                exercise_id: entry.exerciseId,
                position: entry.position,
                rest_seconds: entry.restSeconds,
                note: entry.note,
                superset_group: entry.supersetGroup,
                sets: entry.sets,
              },
              writeScope,
            ),
          false,
        );
      });
      return true;
    },
    [write, writeScope, undoToast, t],
  );

  return {
    create,
    append,
    update,
    remove,
    duplicate,
    updateExercise,
    move,
    replace,
    removeExercise,
  };
}
