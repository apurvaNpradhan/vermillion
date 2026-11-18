import {
  hasWarmupRamp,
  warmupRamp,
  type PlannedSet,
  type WarmupLoading,
  type WeightUnit,
} from "@workspace/shared";
import type { EquipmentRow, SessionExerciseDetail } from "@workspace/sync";

import { defaultBar, enabledBars, loadInputKey, platesForBar } from "../plates/plate-view";

/** The parts of a set the plan reads. */
type PlanSet = Pick<
  SessionExerciseDetail["sets"][number],
  "id" | "kind" | "weightKg" | "completedAt"
>;

/**
 * The first working weight of an exercise: what is typed into its first non-warm-up set, else its
 * Ghost value (Previous, the suggestion or the target). Null when there is none to ramp to.
 */
export function firstWorkingWeightKg(
  exercise: { sets: readonly PlanSet[] },
  ghostWeightOf: (setId: string) => number | null,
): number | null {
  const set = exercise.sets.find((candidate) => candidate.kind !== "warmup");
  if (!set) return null;
  return set.weightKg ?? ghostWeightOf(set.id);
}

/** What can be loaded, with a key that changes only when the kit does. */
type WarmupLoadingKey = { loading: WarmupLoading; key: string };

/** What the user can load for this exercise: its remembered bar and the plates of that bar's unit. */
export function warmupLoading(
  exercise: Pick<SessionExerciseDetail, "barId">,
  rows: readonly EquipmentRow[],
  unit: WeightUnit,
  weightIncrementKg: number | null,
): WarmupLoadingKey {
  const bar = defaultBar(enabledBars(rows), exercise.barId, unit);
  const plates = bar ? platesForBar(rows, bar) : [];
  return {
    loading: { bar: bar ? { weightKg: bar.weightKg, plates } : null, stepKg: weightIncrementKg },
    key: `${loadInputKey(bar, plates)}|${weightIncrementKg ?? "-"}`,
  };
}

/** The ramp as the Planned sets a warm-up row carries: its Ghost weight and reps. */
export function rampTargets(
  exercise: Pick<SessionExerciseDetail, "type" | "exercise" | "barId">,
  workingKg: number,
  rows: readonly EquipmentRow[],
  unit: WeightUnit,
  weightIncrementKg: number | null,
): PlannedSet[] {
  return warmupRamp({
    workingKg,
    exerciseType: exercise.type,
    equipment: exercise.exercise?.equipment ?? "other",
    unit,
    loading: warmupLoading(exercise, rows, unit, weightIncrementKg).loading,
  }).map((step) => ({
    kind: "warmup",
    weight_kg: step.weightKg,
    reps_min: step.reps,
    reps_max: step.reps,
  }));
}

/** Whether "Add warm-ups" makes sense for the exercise at all: a loaded lift. */
export function canAddWarmups(exercise: Pick<SessionExerciseDetail, "type">): boolean {
  return hasWarmupRamp(exercise.type);
}

/**
 * Whether the exercise may be given its ramp by itself right now: it has Auto warm-ups on, a
 * ramp makes sense for its type, and no set of it is ticked yet (once logging starts the ramp is
 * left alone, so a tick is never moved under the user's thumb).
 */
export function shouldAutoWarmup(
  exercise: Pick<SessionExerciseDetail, "autoWarmups" | "type"> & { sets: readonly PlanSet[] },
): boolean {
  return (
    exercise.autoWarmups &&
    hasWarmupRamp(exercise.type) &&
    exercise.sets.every((set) => set.completedAt === null)
  );
}

/**
 * A key that changes only when the ramp's inputs do (the working weight, the loadable kit, the
 * unit): the auto ramp is regenerated on a change of it, not on every render, so a warm-up row the
 * user deleted does not come back until the working weight changes.
 */
export function rampKey(
  workingKg: number,
  exercise: Pick<SessionExerciseDetail, "barId">,
  rows: readonly EquipmentRow[],
  unit: WeightUnit,
  weightIncrementKg: number | null,
): string {
  return `${workingKg}|${unit}|${warmupLoading(exercise, rows, unit, weightIncrementKg).key}`;
}
