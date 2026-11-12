import type { Equipment, ExerciseType } from "../exercise/vocabulary";
import { KG_PER_LB } from "./format";
import type { LoggedSet } from "./logged-set";
import type { PlannedSet } from "./planned-sets";
import type { WeightUnit } from "./vocabulary";

export type IncrementSettings = { weightUnit: WeightUnit; weightIncrementKg: number | null };
export type SuggestedSet = { weightKg: number | null; reps: number | null };
export type Progression = {
  reason: "add_weight" | "add_rep" | "hold" | "same_as_last";
  sets: (SuggestedSet | null)[];
  incrementKg: number;
};

/** Increments are chosen in the display unit and stored in kilograms. */
export function progressionIncrement(equipment: Equipment, settings: IncrementSettings): number {
  return (
    settings.weightIncrementKg ??
    (settings.weightUnit === "lb" ? 5 * KG_PER_LB : equipment === "barbell" ? 2.5 : 2)
  );
}

/** Double progression, matching working sets by ordinal. History is newest first. */
export function suggestNext(
  planned: readonly PlannedSet[],
  sessions: readonly (readonly LoggedSet[])[],
  type: ExerciseType,
  equipment: Equipment,
  settings: IncrementSettings,
): Progression | null {
  if (type !== "weight_reps" && type !== "reps_only" && type !== "bodyweight_reps") return null;
  const working = (sets: readonly LoggedSet[]) =>
    sets.filter((set) => set.kind === "working" && set.completed_at !== null);
  const last = working(sessions[0] ?? []);
  if (!last.length) return null;
  const targets = planned.filter((set) => set.kind === "working");
  if (!targets.length) return null;
  const older = working(sessions[1] ?? []);
  const misses = (sets: readonly LoggedSet[]) =>
    targets.some(
      (target, i) =>
        target.reps_min !== undefined &&
        sets[i]?.reps != null &&
        (sets[i]?.reps ?? 0) < target.reps_min,
    );
  const hold = misses(last) && misses(older);
  const ranged = targets.some((set) => set.reps_min !== undefined);
  // Missing sets never qualify as having completed the entire prescription.
  const topped =
    targets.length === last.length &&
    targets.every(
      (target, i) =>
        target.reps_min !== undefined &&
        (last[i]?.reps ?? 0) >= (target.reps_max ?? target.reps_min),
    ) &&
    last.every((set) => set.weight_kg === last[0]?.weight_kg) &&
    (type !== "weight_reps" || last[0]?.weight_kg != null);
  const incrementKg = progressionIncrement(equipment, settings);
  const reason = hold
    ? "hold"
    : !ranged
      ? "same_as_last"
      : topped && type === "weight_reps"
        ? "add_weight"
        : "add_rep";
  let ordinal = 0;
  const sets = planned.map((target): SuggestedSet | null => {
    if (target.kind !== "working") return null;
    const before = last[ordinal++];
    if (!before) return null;
    const same = { weightKg: before.weight_kg ?? null, reps: before.reps ?? null };
    if (hold || target.reps_min === undefined || before.reps == null) return same;
    const max = target.reps_max ?? target.reps_min;
    if (reason === "add_weight")
      return { weightKg: (before.weight_kg ?? 0) + incrementKg, reps: target.reps_min };
    return { ...same, reps: before.reps < max ? Math.min(max, before.reps + 1) : before.reps };
  });
  return { reason, sets, incrementKg };
}
