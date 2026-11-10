import {
  addExercises,
  addSlot,
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
  type WorkoutExerciseDetail,
  type WorkoutExercisePatch,
  type WorkoutPatch,
} from "@workspace/sync";
import { EXERCISE_TYPE_KEYS, TRAINING_LIMITS } from "@workspace/shared";
import { useToast } from "heroui-native";
import { useCallback } from "react";

import { haptic } from "@/platform/haptics";
import { useTranslation } from "@/platform/i18n";

import { useTrainingWrite } from "./use-training-write";

/** The suffix of a duplicate's title, kept inside the title limit. */
const COPY_SUFFIX = " (copy)";

/** `title` marked as a copy, within the title limit. */
export function copyTitle(title: string) {
  return `${title.slice(0, TRAINING_LIMITS.titleMax - COPY_SUFFIX.length)}${COPY_SUFFIX}`;
}

/**
 * Writes to Workouts and their exercises on the local database: each returns once the change is
 * saved on the device and uploads in the background. A failed write shows a toast and resolves
 * to `null` / `false`, so a screen never has to catch. Deleting and removing offer Undo.
 */
export function useWorkoutActions() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { write, writeScope, training, undoToast } = useTrainingWrite();

  /**
   * A new Workout holding `exerciseIds` in order, standalone or owned by `programId` (then it
   * also fills a new Slot at the end of the Rotation). Null if it could not be made.
   */
  const create = useCallback(
    (exerciseIds: readonly string[], programId: string | null = null) =>
      write(async (db) => {
        const id = await createWorkout(db, { program_id: programId }, writeScope);
        try {
          await addExercises(db, id, exerciseIds, training(), writeScope);
          if (programId !== null) await addSlot(db, programId, id, writeScope);
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
          await updateWorkout(db, copy, { title: copyTitle(title) }, writeScope);
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
