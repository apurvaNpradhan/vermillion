import {
  DEFAULT_WARMUP_STEPS,
  hasWarmupRamp,
  type Equipment,
  warmupRamp,
  type PlannedSet,
  type WarmupLoading,
  type WarmupRounding,
  type WarmupStep,
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

/** The adjustable part of the ramp (Settings > Workout settings > Warm-up calculator). */
export type WarmupSettings = { steps: readonly WarmupStep[]; rounding: WarmupRounding };

const settingsText = (settings: WarmupSettings) =>
  `${settings.rounding}:${settings.steps.map((step) => `${step.percent}x${step.reps}`).join(",")}`;
const DEFAULT_SETTINGS_TEXT = settingsText({ steps: DEFAULT_WARMUP_STEPS, rounding: "equipment" });

/** What can be loaded, with a key that changes only when what the ramp uses does. */
type WarmupLoadingKey = { loading: WarmupLoading; key: string };

/** The library's equipment, or "other" while its metadata has not arrived on this device. */
const equipmentOf = (exercise: Pick<SessionExerciseDetail, "exercise">): Equipment =>
  exercise.exercise?.equipment ?? "other";

/**
 * What the user can load for this exercise: its remembered bar and the plates of that bar's unit.
 * The key holds what the ramp reads: the equipment class, the bar and plates only for a barbell
 * (anything else rounds to the step), and the step; so a ramp made before the library's metadata
 * arrived is rebuilt when it does.
 */
export function warmupLoading(
  exercise: Pick<SessionExerciseDetail, "barId" | "exercise">,
  rows: readonly EquipmentRow[],
  unit: WeightUnit,
  weightIncrementKg: number | null,
): WarmupLoadingKey {
  const equipment = equipmentOf(exercise);
  const bar = defaultBar(enabledBars(rows), exercise.barId, unit);
  const plates = bar ? platesForBar(rows, bar) : [];
  const barKey = equipment === "barbell" ? loadInputKey(bar, plates) : "-";
  return {
    loading: { bar: bar ? { weightKg: bar.weightKg, plates } : null, stepKg: weightIncrementKg },
    key: `${equipment}|${barKey}|${weightIncrementKg ?? "-"}`,
  };
}

/** The ramp as the Planned sets a warm-up row carries: its Ghost weight and reps. */
export function rampTargets(
  exercise: Pick<SessionExerciseDetail, "type" | "exercise" | "barId">,
  workingKg: number,
  rows: readonly EquipmentRow[],
  unit: WeightUnit,
  weightIncrementKg: number | null,
  settings?: WarmupSettings,
): PlannedSet[] {
  return warmupRamp({
    steps: settings?.steps,
    rounding: settings?.rounding,
    workingKg,
    exerciseType: exercise.type,
    equipment: equipmentOf(exercise),
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
 * A key that changes only when the ramp's inputs do (the working weight, the exercise type, the
 * equipment class and the loading it uses, the unit): the automatic ramp is rebuilt on a change
 * of it, not on every render, so a warm-up the user deleted does not come back until an input
 * changes. It is stored with the exercise, so reopening the Session does not rebuild it either.
 */
export function rampKey(
  workingKg: number,
  exercise: Pick<SessionExerciseDetail, "barId" | "type" | "exercise">,
  rows: readonly EquipmentRow[],
  unit: WeightUnit,
  weightIncrementKg: number | null,
  settings?: WarmupSettings,
): string {
  const loading = warmupLoading(exercise, rows, unit, weightIncrementKg).key;
  const base = `${workingKg}|${exercise.type}|${unit}|${loading}`;
  // The default ramp keeps its old key, so no stored ramp is rebuilt by this setting existing.
  const text = settings ? settingsText(settings) : DEFAULT_SETTINGS_TEXT;
  return text === DEFAULT_SETTINGS_TEXT ? base : `${base}|${text}`;
}
