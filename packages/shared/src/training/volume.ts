import type { ExerciseType } from "../exercise/vocabulary";
import { isCounted, type LoggedSet } from "./logged-set";

/**
 * The weight a set moves, by exercise type (ADR 0038). Weighted types: the logged weight.
 * Bodyweight types: the bodyweight preference. Assisted types: bodyweight minus the assistance,
 * floored at 0. Null when the type has no weight or the bodyweight is unknown.
 */
export function effectiveWeight(
  type: ExerciseType,
  weightKg: number | null | undefined,
  bodyweightKg: number | null = null,
): number | null {
  switch (type) {
    case "weight_reps":
    case "short_distance_weight":
      return weightKg ?? null;
    case "bodyweight_reps":
      return bodyweightKg;
    case "bodyweight_assisted_reps":
      return bodyweightKg === null ? null : Math.max(0, bodyweightKg - (weightKg ?? 0));
    case "reps_only":
    case "duration":
    case "distance_duration":
    case "floors_duration":
    case "steps_duration":
      return null;
  }
}

/**
 * Effective weight times reps. 0 without reps or without a weight, so bodyweight exercises add
 * reps but no volume until a bodyweight is known. Does not look at the kind or the tick.
 */
export function setVolume(set: LoggedSet, bodyweightKg: number | null = null): number {
  const weight = effectiveWeight(set.exercise_type, set.weight_kg, bodyweightKg);
  return weight === null || !set.reps ? 0 : weight * set.reps;
}

export type SessionTotals = { volume: number; sets: number; reps: number };

/** Volume, set count and reps over the Counted sets: warm-ups and unticked sets are excluded. */
export function sessionTotals(
  sets: readonly LoggedSet[],
  bodyweightKg: number | null = null,
): SessionTotals {
  const totals: SessionTotals = { volume: 0, sets: 0, reps: 0 };
  for (const set of sets) {
    if (!isCounted(set)) continue;
    totals.volume += setVolume(set, bodyweightKg);
    totals.sets += 1;
    totals.reps += set.reps ?? 0;
  }
  return totals;
}

/** Brzycki: weight × 36 / (37 − reps) for 1 to 12 reps; null for any other count or a 0 weight. */
export function estimatedOneRepMax(weight: number, reps: number): number | null {
  if (!Number.isInteger(reps) || reps < 1 || reps > 12 || weight <= 0) return null;
  return (weight * 36) / (37 - reps);
}
