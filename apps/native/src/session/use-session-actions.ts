import { EXERCISE_TYPE_KEYS, type Ghosts, type PlannedSet } from "@workspace/shared";
import {
  addSessionExercises,
  addSet,
  adjustRest,
  clearRest,
  discardSession,
  finishSession,
  leaveSessionSuperset,
  moveSessionExercise,
  readExerciseType,
  removeSessionExercise,
  removeSet,
  replaceSessionExercise,
  restoreSession,
  setDerivedTitle,
  supersetSessionWithNext,
  takeOver,
  tickSet,
  untickSet,
  updateSessionExercise,
  updateSet,
  type FinishInput,
  type FinishResult,
  type SessionExercisePatch,
  type SetPatch,
  type TickResult,
} from "@workspace/sync";
import { useToast } from "heroui-native";
import { useCallback } from "react";

import { haptic } from "@/platform/haptics";
import { useTranslation } from "@/platform/i18n";
import { useTrainingWrite } from "@/training";

/**
 * Writes to the Session on the local database, each returning once the change is saved on the
 * device (it uploads in the background). A failed write shows a toast and resolves to the
 * fallback, so a screen never has to catch. Components never call the store.
 */
export function useSessionActions() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { write, writeScope, training, undoToast } = useTrainingWrite();

  /**
   * Ticks a set, its empty cells adopting `ghosts`, and starts the Rest after it when `restSeconds`
   * is given, in one write. `null` when the write failed.
   */
  const tick = useCallback(
    (setId: string, ghosts: Ghosts, restSeconds: number | null = null) =>
      write<TickResult | null>((db) => tickSet(db, setId, ghosts, writeScope, restSeconds), null),
    [write, writeScope],
  );

  /** Moves the end of the running Rest; a Rest pushed to now is ended. */
  const nudgeRest = useCallback(
    (sessionId: string, deltaSeconds: number) =>
      write((db) => adjustRest(db, sessionId, deltaSeconds, writeScope), null),
    [write, writeScope],
  );

  const skipRest = useCallback(
    (sessionId: string) => write((db) => clearRest(db, sessionId, writeScope), false),
    [write, writeScope],
  );

  const untick = useCallback(
    (setId: string) => write((db) => untickSet(db, setId, writeScope), false),
    [write, writeScope],
  );

  const updateValues = useCallback(
    (setId: string, patch: SetPatch) =>
      write((db) => updateSet(db, setId, patch, writeScope), false),
    [write, writeScope],
  );

  const addExtraSet = useCallback(
    (exerciseId: string, target: PlannedSet | null) =>
      write(async (db) => {
        await addSet(db, exerciseId, { target }, writeScope);
        return true;
      }, false),
    [write, writeScope],
  );

  const removeOneSet = useCallback(
    (setId: string) =>
      write(async (db) => (await removeSet(db, setId, writeScope)) !== null, false),
    [write, writeScope],
  );

  const addExercises = useCallback(
    (sessionId: string, exerciseIds: readonly string[]) =>
      write(async (db) => {
        await addSessionExercises(db, sessionId, exerciseIds, training(), writeScope);
        haptic.confirm();
        return true;
      }, false),
    [write, writeScope, training],
  );

  /** Swaps the exercise; a toast says so when the type changed and the sets were reset. */
  const replaceExercise = useCallback(
    (id: string, fromExerciseId: string, exerciseId: string) =>
      write(async (db) => {
        const [before, after] = await Promise.all([
          readExerciseType(db, fromExerciseId),
          readExerciseType(db, exerciseId),
        ]);
        const changed = await replaceSessionExercise(db, id, exerciseId, training(), writeScope);
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
    (id: string) =>
      write(async (db) => {
        const removed = await removeSessionExercise(db, id, writeScope);
        if (removed) haptic.confirm();
        return removed !== null;
      }, false),
    [write, writeScope],
  );

  const moveExercise = useCallback(
    (id: string, beforeId: string | null) =>
      write((db) => moveSessionExercise(db, id, beforeId, writeScope), false),
    [write, writeScope],
  );

  const updateExercise = useCallback(
    (id: string, patch: SessionExercisePatch) =>
      write((db) => updateSessionExercise(db, id, patch, writeScope), false),
    [write, writeScope],
  );

  const superset = useCallback(
    (id: string) => write((db) => supersetSessionWithNext(db, id, writeScope), false),
    [write, writeScope],
  );

  const leaveSuperset = useCallback(
    (id: string) => write((db) => leaveSessionSuperset(db, id, writeScope), false),
    [write, writeScope],
  );

  /** Keeps a derived title in step with the exercises; a renamed Session is left alone. */
  const refreshDerivedTitle = useCallback(
    (id: string, title: string) => write((db) => setDerivedTitle(db, id, title, writeScope), false),
    [write, writeScope],
  );

  const takeOverSession = useCallback(
    (id: string) =>
      write(async (db) => {
        const moved = await takeOver(db, id, writeScope);
        if (moved) haptic.confirm();
        return moved;
      }, false),
    [write, writeScope],
  );

  const finish = useCallback(
    (id: string, input: FinishInput = {}) =>
      write<FinishResult | null>(async (db) => {
        const result = await finishSession(db, id, input, writeScope);
        haptic.success();
        return result;
      }, null),
    [write, writeScope],
  );

  /** Discards with Undo. */
  const discard = useCallback(
    async (id: string, title: string) => {
      const deleted = await write((db) => discardSession(db, id, writeScope), null);
      if (!deleted) return false;
      haptic.confirm();
      undoToast(t("session__discarded_toast", { title }), () => {
        void write((db) => restoreSession(db, deleted, writeScope), false);
      });
      return true;
    },
    [write, writeScope, undoToast, t],
  );

  return {
    tick,
    nudgeRest,
    skipRest,
    untick,
    updateValues,
    addExtraSet,
    removeOneSet,
    addExercises,
    replaceExercise,
    removeExercise,
    moveExercise,
    updateExercise,
    superset,
    leaveSuperset,
    refreshDerivedTitle,
    takeOver: takeOverSession,
    finish,
    discard,
  };
}
