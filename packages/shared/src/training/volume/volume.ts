import type { ExerciseType } from "../../exercise/vocabulary";
import { isCounted, type LoggedSet } from "../logging/logged-set";

/**
 * The weight a set moves, by exercise type (ADR 0038). Weighted types: the logged weight.
 * Bodyweight types: the bodyweight preference. Assisted types: bodyweight minus the assistance,
 * floored at 0. Weighted bodyweight types: bodyweight plus the added load, or the added load alone
 * while the bodyweight is unknown. Null when the type has no weight (or, for the bodyweight and
 * assisted types, the bodyweight is unknown).
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
    case "bodyweight_weighted_reps":
      return (bodyweightKg ?? 0) + (weightKg ?? 0);
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
type VolumeSet = Pick<LoggedSet, "exercise_type" | "weight_kg" | "reps" | "bodyweight_kg">;

export function setVolume(set: VolumeSet, bodyweightKg: number | null = null): number {
  const weight = effectiveWeight(
    set.exercise_type,
    set.weight_kg,
    set.bodyweight_kg === undefined ? bodyweightKg : set.bodyweight_kg,
  );
  return weight === null || !set.reps ? 0 : weight * set.reps;
}

export type SessionTotals = { volume: number; sets: number; reps: number };

/** Volume, set count and reps over the Counted sets: warm-ups and unticked sets are excluded. */
export function sessionTotals(
  sets: readonly (VolumeSet & Parameters<typeof isCounted>[0])[],
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

/** The lowest effort a set can be logged at: 4 reps are left in reserve there. */
const MAX_RESERVE = 4;

/** Reps left in the tank at an effort: 10 − RPE, 0 with none logged, at most 4 (RPE 6). */
export function repsInReserve(rpe: number | null | undefined): number {
  return rpe == null ? 0 : Math.min(MAX_RESERVE, Math.max(0, 10 - rpe));
}

/**
 * Brzycki: weight × 36 / (37 − reps) for 1 to 12 reps; null for any other count or a 0 weight.
 * With the set's effort logged, the reps left in reserve count as reps (8 at RPE 8 is a 10-rep
 * set), up to 12; a set logged to failure, or with no effort, is its reps alone.
 */
export function estimatedOneRepMax(
  weight: number,
  reps: number,
  rpe?: number | null,
): number | null {
  if (!Number.isInteger(reps) || reps < 1 || reps > 12 || weight <= 0) return null;
  const capacity = Math.min(12, reps + repsInReserve(rpe));
  return (weight * 36) / (37 - capacity);
}
