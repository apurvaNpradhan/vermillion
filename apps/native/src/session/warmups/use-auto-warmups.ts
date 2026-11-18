import type { SessionDetail, SessionExerciseDetail } from "@workspace/sync";
import { useCallback, useEffect, useRef } from "react";
import type { WeightUnit } from "@workspace/shared";

import { useEquipment } from "../plates/use-plates";
import type { useSessionActions } from "../screen/use-session-actions";
import {
  canAddWarmups,
  firstWorkingWeightKg,
  rampKey,
  rampTargets,
  shouldAutoWarmup,
} from "./warmup-plan";

type Actions = Pick<ReturnType<typeof useSessionActions>, "replaceWarmups">;

/**
 * Warm-up ramps for a live Session. An exercise with Auto warm-ups gets its ramp when it is
 * first seen and again when its first working weight (or the kit) changes, until anything of it
 * is ticked; "Add warm-ups" builds one on demand for any loaded lift. Both only replace warm-ups
 * nobody has touched (see `replaceWarmups`), so a ticked or edited set is never changed.
 * `ghostWeightOf` is the Ghost weight of a set; the hook waits for the Previous history.
 */
export function useAutoWarmups({
  session,
  ghostWeightOf,
  historyReady,
  unit,
  weightIncrementKg,
  readOnly,
  actions,
}: {
  session: SessionDetail;
  ghostWeightOf: (setId: string) => number | null;
  historyReady: boolean;
  unit: WeightUnit;
  weightIncrementKg: number | null;
  readOnly: boolean;
  actions: Actions;
}) {
  const active = !readOnly && session.finishedAt === null;
  const equipment = useEquipment(active);
  const rows = equipment.rows;
  const equipmentReady = equipment.value !== undefined;
  const applied = useRef(new Map<string, string>());
  const { replaceWarmups } = actions;

  useEffect(() => {
    if (!active || !historyReady || !equipmentReady) return;
    for (const exercise of session.exercises) {
      if (!shouldAutoWarmup(exercise)) continue;
      const workingKg = firstWorkingWeightKg(exercise, ghostWeightOf);
      if (workingKg === null || workingKg <= 0) continue;
      const key = rampKey(workingKg, exercise, rows, unit, weightIncrementKg);
      if (applied.current.get(exercise.id) === key) continue;
      applied.current.set(exercise.id, key);
      void replaceWarmups(
        exercise.id,
        rampTargets(exercise, workingKg, rows, unit, weightIncrementKg),
      );
    }
  }, [
    active,
    historyReady,
    equipmentReady,
    session.exercises,
    ghostWeightOf,
    rows,
    unit,
    weightIncrementKg,
    replaceWarmups,
  ]);

  /** Builds the ramp now; "none" when the weight is too light or unknown. */
  const addWarmups = useCallback(
    async (exercise: SessionExerciseDetail): Promise<"added" | "none"> => {
      const workingKg = canAddWarmups(exercise)
        ? firstWorkingWeightKg(exercise, ghostWeightOf)
        : null;
      const ramp =
        workingKg !== null && workingKg > 0
          ? rampTargets(exercise, workingKg, rows, unit, weightIncrementKg)
          : [];
      if (ramp.length === 0) return "none";
      await replaceWarmups(exercise.id, ramp);
      // The user asked for this ramp: the automatic one must not undo it for the same weight.
      if (workingKg !== null) {
        applied.current.set(
          exercise.id,
          rampKey(workingKg, exercise, rows, unit, weightIncrementKg),
        );
      }
      return "added";
    },
    [ghostWeightOf, rows, unit, weightIncrementKg, replaceWarmups],
  );

  return { addWarmups };
}
