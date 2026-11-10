import {
  addSlot,
  copyProgram,
  copyWorkout,
  copyWorkoutIntoProgram,
  createProgram,
  deleteProgram,
  duplicateSlotWorkout,
  moveSlot,
  removeFromRotation,
  restoreFromRotation,
  restoreProgram,
  updateProgram,
  updateWorkout,
  type ProgramPatch,
} from "@workspace/sync";
import { useRouter } from "expo-router";
import { useToast } from "heroui-native";
import { useCallback } from "react";

import { haptic } from "@/platform/haptics";
import { useTranslation } from "@/platform/i18n";

import { copyTitle } from "./use-workout-actions";
import { useTrainingWrite } from "./use-training-write";

/**
 * Writes to Programs and their Rotations on the local database, as {@link useWorkoutActions}
 * does for Workouts: each returns once the change is saved on the device, a failure toasts and
 * resolves to `null` / `false`, and removing or deleting offers Undo. Copies between standalone
 * and Program say so in a toast that opens the result.
 */
export function useProgramActions() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const router = useRouter();
  const { write, writeScope, undoToast } = useTrainingWrite();

  const create = useCallback(
    (title: string) =>
      write(async (db) => {
        const id = await createProgram(
          db,
          { title, description: null, planned_weeks: null },
          writeScope,
        );
        haptic.confirm();
        return id;
      }, null),
    [write, writeScope],
  );

  const update = useCallback(
    (id: string, patch: ProgramPatch) =>
      write((db) => updateProgram(db, id, patch, writeScope), false),
    [write, writeScope],
  );

  const remove = useCallback(
    async (id: string, title: string) => {
      const deleted = await write((db) => deleteProgram(db, id, writeScope), null);
      if (!deleted) return false;
      haptic.confirm();
      undoToast(t("training__program_deleted_toast", { title }), () => {
        void write((db) => restoreProgram(db, deleted, writeScope), false);
      });
      return true;
    },
    [write, writeScope, undoToast, t],
  );

  const duplicate = useCallback(
    (id: string, title: string) =>
      write(async (db) => {
        const copy = await copyProgram(db, id, writeScope);
        await updateProgram(db, copy, { title: copyTitle(title) }, writeScope);
        haptic.confirm();
        return copy;
      }, null),
    [write, writeScope],
  );

  const addRest = useCallback(
    (programId: string) =>
      write(async (db) => {
        await addSlot(db, programId, null, writeScope);
        haptic.confirm();
        return true;
      }, false),
    [write, writeScope],
  );

  /** Another Slot for a Workout the Program already has: it is the same Workout, not a copy. */
  const repeat = useCallback(
    (programId: string, workoutId: string) =>
      write(async (db) => {
        await addSlot(db, programId, workoutId, writeScope);
        haptic.confirm();
        return true;
      }, false),
    [write, writeScope],
  );

  /**
   * Copies a standalone Workout, or one of this Program's (`title` is then marked as a copy),
   * into the Program as a new Slot at the end.
   */
  const addCopy = useCallback(
    (programId: string, workoutId: string, own: { title: string | null } | null) =>
      write(async (db) => {
        const added = await copyWorkoutIntoProgram(db, workoutId, programId, writeScope);
        if (own !== null && own.title !== null) {
          await updateWorkout(db, added.workoutId, { title: copyTitle(own.title) }, writeScope);
        }
        haptic.confirm();
        return added.workoutId;
      }, null),
    [write, writeScope],
  );

  const move = useCallback(
    (slotId: string, beforeId: string | null) =>
      write((db) => moveSlot(db, slotId, beforeId, writeScope), false),
    [write, writeScope],
  );

  /** Removes a Slot; its Workout goes too when it was the last Slot using it, and the toast says so. */
  const removeSlot = useCallback(
    async (slotId: string, title: string | null) => {
      const removed = await write((db) => removeFromRotation(db, slotId, writeScope), null);
      if (!removed) return false;
      haptic.confirm();
      const label =
        removed.kind === "workout"
          ? t("training__rotation_removed_workout_toast", { title: title ?? "" })
          : title === null
            ? t("training__rotation_removed_rest_toast")
            : t("training__rotation_removed_toast", { title });
      undoToast(label, () => {
        void write((db) => restoreFromRotation(db, removed, writeScope), false);
      });
      return true;
    },
    [write, writeScope, undoToast, t],
  );

  /** Gives the Slot its own copy of its Workout, which `title` (null when derived) tells apart. */
  const duplicateSlot = useCallback(
    (slotId: string, title: string | null) =>
      write(async (db) => {
        const result = await duplicateSlotWorkout(db, slotId, writeScope);
        if (!result) return null;
        if (result.originalKept && title !== null) {
          await updateWorkout(db, result.workoutId, { title: copyTitle(title) }, writeScope);
        }
        haptic.confirm();
        return result.workoutId;
      }, null),
    [write, writeScope],
  );

  /** Copies a Workout out of its Program (or just copies it); the toast opens the standalone copy. */
  const saveAsStandalone = useCallback(
    async (workoutId: string) => {
      const copy = await write((db) => copyWorkout(db, workoutId, null, writeScope), null);
      if (!copy) return null;
      haptic.confirm();
      toast.show({
        label: t("training__saved_standalone_toast"),
        actionLabel: t("common__open"),
        onActionPress: ({ hide }) => {
          hide();
          router.push({ pathname: "/train/workout/[id]", params: { id: copy } });
        },
      });
      return copy;
    },
    [write, writeScope, toast, t, router],
  );

  /** Copies a standalone Workout into a Program as a new Slot; the toast opens the Program. */
  const addToProgram = useCallback(
    async (workoutId: string, programId: string, programTitle: string) => {
      const added = await write(
        (db) => copyWorkoutIntoProgram(db, workoutId, programId, writeScope),
        null,
      );
      if (!added) return null;
      haptic.confirm();
      toast.show({
        label: t("training__added_toast", { title: programTitle }),
        actionLabel: t("common__open"),
        onActionPress: ({ hide }) => {
          hide();
          router.push({ pathname: "/train/program/[id]", params: { id: programId } });
        },
      });
      return added.workoutId;
    },
    [write, writeScope, toast, t, router],
  );

  return {
    create,
    update,
    remove,
    duplicate,
    addRest,
    repeat,
    addCopy,
    move,
    removeSlot,
    duplicateSlot,
    saveAsStandalone,
    addToProgram,
  };
}
