import type { ExerciseType } from "../../exercise/vocabulary";
import type { LoadBasis } from "../progress/load-grid";
import { progresses } from "../progress/progression";
import { KG_PER_LB, loadIdentity } from "../vocabulary/format";
import { MAX_WEIGHT_KG, type SetKind, type WeightUnit } from "../vocabulary/vocabulary";

/**
 * Entry guards: whether a typed set or weigh-in is far enough outside what the lifter has done
 * that it is worth one quiet question. Pure and unit-aware; the caller decides what to ask and
 * never blocks (see docs/specs/training/entry-guards.md). Lower than usual is never a reason,
 * except the pounds-for-kilograms slip.
 */

/** What an exercise's history says: its heaviest completed working load and best working reps. */
export type ExerciseReference = {
  heaviestKg: number | null;
  bestReps: number | null;
};

type HistorySet = {
  kind: SetKind;
  weight_kg?: number | null;
  reps?: number | null;
  completed_at: string | null;
};

/** The reference of an exercise from its logged sets: completed working, top and back-off sets. */
export function referenceFrom(sets: readonly HistorySet[]): ExerciseReference {
  let heaviestKg: number | null = null;
  let bestReps: number | null = null;
  for (const set of sets) {
    if (set.completed_at === null || !progresses(set.kind)) continue;
    const kg = set.weight_kg ?? null;
    if (kg !== null && kg > 0 && (heaviestKg === null || kg > heaviestKg)) heaviestKg = kg;
    const reps = set.reps ?? null;
    if (reps !== null && reps > 0 && (bestReps === null || reps > bestReps)) bestReps = reps;
  }
  return { heaviestKg, bestReps };
}

export type SetCheckInput = {
  type: ExerciseType;
  /** How the logged load reads: per dumbbell, per side of a bar, or the whole load. */
  basis: LoadBasis;
  /** The unit the lifter sees; it decides the +20 kg / +45 lb margin and the 90 lb floor. */
  unit: WeightUnit;
  /** What the lifter typed; null for a cell they left to a Ghost value or that has none. */
  weightKg: number | null;
  reps: number | null;
  history: ExerciseReference;
  /** Today's suggested load for the set, when there is one. */
  suggestedKg: number | null;
};

export type SetCheck =
  /** Far above the heaviest load in history (or above today's suggestion when that is higher). */
  | { reason: "high_load"; referenceKg: number; source: "history" | "suggestion" }
  /** No history to compare with, and the load is above what the equipment is made for. */
  | { reason: "ceiling"; ceilingKg: number }
  /** About 2.2x (up) or 1/2.2 (down) of the reference: likely kilograms and pounds mixed up. */
  | { reason: "unit_slip"; direction: "up" | "down"; referenceKg: number }
  | { reason: "high_reps"; bestReps: number | null }
  /** Reps in the weight cell and a weight in the reps cell; `weightKg` and `reps` swap them. */
  | { reason: "swapped"; weightKg: number; reps: number };

const WEIGHT_TYPES: readonly ExerciseType[] = [
  "weight_reps",
  "bodyweight_weighted_reps",
  "bodyweight_assisted_reps",
  "short_distance_weight",
];
const LOADED_REPS_TYPES: readonly ExerciseType[] = ["weight_reps", "bodyweight_weighted_reps"];

const HIGH_LOAD_RATIO = 1.5;
const HIGH_LOAD_MARGIN = { kg: 20, lb: 45 } as const satisfies Record<WeightUnit, number>;
const SLIP_RATIO = 2.2;
const SLIP_TOLERANCE = 0.05;
const SLIP_DOWN_MIN = { kg: 40, lb: 90 } as const satisfies Record<WeightUnit, number>;
const CEILING_KG = { per_hand: 80, per_side: 150, total: 300 } as const satisfies Record<
  LoadBasis,
  number
>;
const WEIGHTED_BODYWEIGHT_CEILING_KG = 100;
const ASSISTED_CEILING_KG = 150;
const HIGH_REPS = 50;
const HIGH_REPS_HISTORY = 25;
const REPS_RATIO = 3;
const REPS_FLOOR = 30;
const SWAP_MAX_WEIGHT = 30;

const inUnit = (kg: number, unit: WeightUnit) => (unit === "lb" ? kg / KG_PER_LB : kg);
const toKg = (value: number, unit: WeightUnit) =>
  unit === "lb" ? loadIdentity(value * KG_PER_LB) : value;

function ceilingKg(type: ExerciseType, basis: LoadBasis): number {
  if (type === "bodyweight_weighted_reps") return WEIGHTED_BODYWEIGHT_CEILING_KG;
  if (type === "bodyweight_assisted_reps") return ASSISTED_CEILING_KG;
  return CEILING_KG[basis];
}

/**
 * The set to ask about, or null for a set that looks like the lifter's own. The checks run in
 * order of how specific the reason is: swapped fields, a unit slip, a high load against the
 * reference, the equipment ceiling when there is no history, then reps.
 */
export function checkSet(input: SetCheckInput): SetCheck | null {
  const { type, basis, unit, weightKg, reps, history, suggestedKg } = input;
  const hasWeight = WEIGHT_TYPES.includes(type) && weightKg !== null && weightKg > 0;
  const heaviest = history.heaviestKg ?? 0;
  const suggested = suggestedKg ?? 0;
  const referenceKg = Math.max(heaviest, suggested);
  const hasReference = referenceKg > 0;
  const hasReps = reps !== null && reps > 0;

  if (hasWeight && hasReference && hasReps) {
    const swapped = swappedFields(weightKg, reps, referenceKg, unit);
    if (swapped) return { reason: "swapped", ...swapped };
  }

  if (hasWeight && hasReference) {
    const up = referenceKg * SLIP_RATIO;
    const down = referenceKg / SLIP_RATIO;
    if (Math.abs(weightKg - up) <= up * SLIP_TOLERANCE) {
      return { reason: "unit_slip", direction: "up", referenceKg };
    }
    if (
      referenceKg >= toKg(SLIP_DOWN_MIN[unit], unit) &&
      Math.abs(weightKg - down) <= down * SLIP_TOLERANCE
    ) {
      return { reason: "unit_slip", direction: "down", referenceKg };
    }
    if (
      weightKg > referenceKg * HIGH_LOAD_RATIO &&
      weightKg > referenceKg + toKg(HIGH_LOAD_MARGIN[unit], unit)
    ) {
      return {
        reason: "high_load",
        referenceKg,
        source: suggested > heaviest ? "suggestion" : "history",
      };
    }
  } else if (hasWeight) {
    const ceiling = ceilingKg(type, basis);
    if (weightKg > ceiling) return { reason: "ceiling", ceilingKg: ceiling };
  }

  if (hasReps) {
    const best = history.bestReps;
    const loaded = LOADED_REPS_TYPES.includes(type);
    if (loaded && reps > HIGH_REPS && (best ?? 0) <= HIGH_REPS_HISTORY) {
      return { reason: "high_reps", bestReps: best };
    }
    if (best !== null && reps > best * REPS_RATIO && reps > REPS_FLOOR) {
      return { reason: "high_reps", bestReps: best };
    }
  }
  return null;
}

/**
 * A small whole number in the weight cell and a load-sized number in the reps cell. The number of
 * reps must be at least three times the weight and half the reference load or more, so a light
 * exercise done for many reps is left alone. Returns the two values the other way round.
 */
function swappedFields(
  weightKg: number,
  reps: number,
  referenceKg: number,
  unit: WeightUnit,
): { weightKg: number; reps: number } | null {
  const shown = inUnit(weightKg, unit);
  const whole = Math.round(shown);
  if (Math.abs(shown - whole) > 0.01 || whole < 1 || whole > SWAP_MAX_WEIGHT) return null;
  const reference = inUnit(referenceKg, unit);
  if (reps < REPS_RATIO * whole || reps < reference / 2 || whole > reference / 3) return null;
  const swappedKg = toKg(reps, unit);
  if (swappedKg > MAX_WEIGHT_KG) return null;
  return { weightKg: swappedKg, reps: whole };
}

const WEIGH_IN_MIN_KG = 25;
const WEIGH_IN_MAX_KG = 350;
const TREND_SHARE = 0.07;
const TREND_MARGIN = { kg: 3, lb: 7 } as const satisfies Record<WeightUnit, number>;

export type WeighInCheck =
  | { reason: "out_of_range" }
  | { reason: "far_from_trend"; trendKg: number };

/** A weigh-in outside 25 to 350 kg, or more than 7% and 3 kg (7 lb) from the trend weight. */
export function checkWeighIn(input: {
  kg: number;
  trendKg: number | null;
  unit: WeightUnit;
}): WeighInCheck | null {
  const { kg, trendKg, unit } = input;
  if (kg < WEIGH_IN_MIN_KG || kg > WEIGH_IN_MAX_KG) return { reason: "out_of_range" };
  if (trendKg === null || trendKg <= 0) return null;
  const apart = Math.abs(kg - trendKg);
  if (apart > trendKg * TREND_SHARE && apart > toKg(TREND_MARGIN[unit], unit)) {
    return { reason: "far_from_trend", trendKg };
  }
  return null;
}
