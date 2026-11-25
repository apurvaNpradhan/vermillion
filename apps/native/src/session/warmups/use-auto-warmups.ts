import type { SessionDetail, SessionExerciseDetail } from "@workspace/sync";
import { useCallback, useEffect, useRef, useState } from "react";
import type { WeightUnit } from "@workspace/shared";

import type { GymLoads } from "@/gym";

import { useEquipment } from "../plates/use-plates";
import type { useSessionActions } from "../screen/use-session-actions";
import {
  canAddWarmups,
  firstWorkingWeightKg,
  rampKey,
  rampTargets,
  shouldAutoWarmup,
  type WarmupSettings,
} from "./warmup-plan";

type Actions = Pick<ReturnType<typeof useSessionActions>, "replaceWarmups">;

/** How long a deferred ramp waits for the keypad's writes before it looks again. */
const RETRY_MS = 600;

/**
 * Warm-up ramps for a live Session. An exercise with Auto warm-ups gets its ramp when it is
 * first seen and again when its inputs (the first working weight, the kit, the equipment class)
 * change, until anything of it is ticked; "Add warm-ups" builds one on demand for any loaded
 * lift. The inputs the ramp was last built from are stored with the exercise (`warmupKey`), so a
 * warm-up the user deleted stays deleted across reopening the Session or the Timer. The store
 * rechecks ownership, "not finished" and "nothing ticked" inside its own transaction, and only
 * replaces warm-ups nobody has touched (see `replaceWarmups`).
 * `ghostWeightOf` is the Ghost weight of a set; the hook waits for the Previous history, and
 * while the keypad has typed values not yet written it flushes them and looks again, so a ramp
 * never replaces a warm-up the user is typing into.
 */
export function useAutoWarmups({
  session,
  ghostWeightOf,
  historyReady,
  unit,
  weightIncrementKg,
  warmupSettings,
  readOnly,
  actions,
  editsPending,
  flushEdits,
  gym,
}: {
  session: SessionDetail;
  ghostWeightOf: (setId: string) => number | null;
  historyReady: boolean;
  unit: WeightUnit;
  weightIncrementKg: number | null;
  warmupSettings: WarmupSettings;
  readOnly: boolean;
  actions: Actions;
  editsPending: () => boolean;
  flushEdits: () => void;
  gym: GymLoads;
}) {
  const active = !readOnly && session.finishedAt === null;
  const equipment = useEquipment(active, gym.gymId ?? undefined, true);
  const rows = equipment.rows;
  const equipmentReady = equipment.value !== undefined;
  const asked = useRef(new Set<string>());
  const [looks, setLooks] = useState(0);
  const { replaceWarmups } = actions;

  useEffect(() => {
    if (!active || !historyReady || !equipmentReady) return;
    let deferred = false;
    for (const exercise of session.exercises) {
      if (!shouldAutoWarmup(exercise)) continue;
      const workingKg = firstWorkingWeightKg(exercise, ghostWeightOf);
      if (workingKg === null) continue;
      const ranges = gym.settingFor(exercise.exerciseId)?.loadRanges;
      const key = rampKey(
        workingKg,
        exercise,
        rows,
        unit,
        weightIncrementKg,
        warmupSettings,
        ranges,
      );
      if (exercise.warmupKey === key) continue;
      if (editsPending()) {
        flushEdits();
        deferred = true;
        continue;
      }
      // Only to avoid asking again while the write is on its way; the stored key is the truth.
      const asking = `${exercise.id}|${key}`;
      if (asked.current.has(asking)) continue;
      asked.current.add(asking);
      void replaceWarmups(
        exercise.id,
        rampTargets(exercise, workingKg, rows, unit, weightIncrementKg, warmupSettings, ranges),
        { key, auto: true },
      ).finally(() => asked.current.delete(asking));
    }
    if (!deferred) return;
    const timer = setTimeout(() => setLooks((count) => count + 1), RETRY_MS);
    return () => clearTimeout(timer);
  }, [
    active,
    historyReady,
    equipmentReady,
    gym,
    session.exercises,
    ghostWeightOf,
    rows,
    unit,
    weightIncrementKg,
    warmupSettings,
    replaceWarmups,
    editsPending,
    flushEdits,
    looks,
  ]);

  /** Builds the ramp now; "none" when the weight is too light or unknown. */
  const addWarmups = useCallback(
    async (exercise: SessionExerciseDetail): Promise<"added" | "none"> => {
      const workingKg = canAddWarmups(exercise)
        ? firstWorkingWeightKg(exercise, ghostWeightOf)
        : null;
      const ranges = gym.settingFor(exercise.exerciseId)?.loadRanges;
      const ramp =
        workingKg !== null && workingKg > 0
          ? rampTargets(exercise, workingKg, rows, unit, weightIncrementKg, warmupSettings, ranges)
          : [];
      if (ramp.length === 0 || workingKg === null) return "none";
      // The user asked for this ramp: storing its key keeps the automatic one from redoing it.
      await replaceWarmups(exercise.id, ramp, {
        key: rampKey(workingKg, exercise, rows, unit, weightIncrementKg, warmupSettings, ranges),
      });
      return "added";
    },
    [ghostWeightOf, gym, rows, unit, weightIncrementKg, warmupSettings, replaceWarmups],
  );

  return { addWarmups };
}
