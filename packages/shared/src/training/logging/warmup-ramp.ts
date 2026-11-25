import { z } from "zod";

import type { LoadGrid } from "../progress/load-grid";
import { KG_PER_LB } from "../vocabulary/format";
import type { ExerciseType, Equipment } from "../../exercise/vocabulary";
import type { WeightUnit } from "../vocabulary/vocabulary";
import { nearestBarLoadKg, smallestBarStepKg, type LoadPlate } from "../plates/plates";

/** One generated warm-up set: a load in kilograms and a rep count. */
export type WarmupSet = { weightKg: number; reps: number };

/**
 * What the user can load. Exercise ranges take priority. Without them, a barbell with a known
 * bar loads in plate pairs and other lifts round to `stepKg`, defaulting to 2.5 kg or 5 lb.
 */
export type WarmupLoading = {
  bar: { weightKg: number; plates: readonly LoadPlate[] } | null;
  stepKg?: number | null;
  grid?: LoadGrid | null;
  capKg?: number | null;
};

/** One adjustable step of the ramp: a share of the working weight, for some reps. */
export const warmupStepSchema = z.object({
  percent: z.number().int().min(10).max(95),
  reps: z.number().int().min(1).max(30),
});
export type WarmupStep = z.infer<typeof warmupStepSchema>;

/** How many adjustable steps the ramp may have (the opener is extra). */
export const WARMUP_STEPS_MAX = 6;
export const warmupStepsSchema = z.array(warmupStepSchema).min(1).max(WARMUP_STEPS_MAX);

/** The ramp's default steps: 50% for 5, 70% for 3 and 85% for 1. */
export const DEFAULT_WARMUP_STEPS: readonly WarmupStep[] = [
  { percent: 50, reps: 5 },
  { percent: 70, reps: 3 },
  { percent: 85, reps: 1 },
];

/** How a warm-up load is rounded: to what the kit can make, or to a fixed increment. */
export const WARMUP_ROUNDINGS = ["equipment", "increment"] as const;
export type WarmupRounding = (typeof WARMUP_ROUNDINGS)[number];

const DEFAULT_STEP = { kg: 2.5, lb: 5 * KG_PER_LB } as const satisfies Record<WeightUnit, number>;
const SAME = 0.0005;

/**
 * The ramp: the opener (the bar, or 40% when there is no bar) for 10, then the steps (by default
 * 50% for 5, 70% for 3 and 85% for 1 of the working weight). `capOf` is the most a step may be of the working weight after
 * rounding; a coarse kit whose nearest load is above it skips the step, so a set of five is never
 * near the working weight.
 */
/** The most a step may be of the working weight after rounding: 10 points over, never over 92%. */
const capOf = (fraction: number) => Math.min(fraction + 0.1, 0.92);
const OPENER = { barless: { fraction: 0.4, reps: 10 }, bar: { reps: 10 } } as const;

/**
 * Only plain loaded lifts get a ramp. Bodyweight, weighted bodyweight, assisted, reps-only,
 * timed and cardio types have no meaningful load to ramp towards: a weighted pull-up warms up
 * with bodyweight reps, and an assisted one with less assistance is a different decision, so
 * they get none rather than a guess.
 */
export function hasWarmupRamp(type: ExerciseType): boolean {
  return type === "weight_reps";
}

function roundToStep(kg: number, stepKg: number): number {
  return Math.round(kg / stepKg + 1e-9) * stepKg;
}

/**
 * The warm-up sets that lead into a first working weight, lightest first. Every load is rounded to
 * what can be loaded (the plate calculator's nearest load on a bar, else the step). A step is
 * skipped when it rounds to the load before it or reaches the working weight, so the ramp is
 * shorter as the weight gets lighter. None for a type without a ramp, a working weight that is
 * not above the bar plus the smallest step (or two steps for a step load), or a nonsense weight.
 */
export function warmupRamp(input: {
  workingKg: number;
  exerciseType: ExerciseType;
  equipment: Equipment;
  unit: WeightUnit;
  loading: WarmupLoading;
  /** The adjustable steps; the default ramp when absent. */
  steps?: readonly WarmupStep[];
  /** Without exercise ranges, `increment` uses the fixed step even on a bar. */
  rounding?: WarmupRounding;
}): WarmupSet[] {
  const { workingKg, exerciseType, equipment, unit, loading } = input;
  // Lightest first, so the ramp always climbs whatever order the steps were given in.
  const steps = [...(input.steps ?? DEFAULT_WARMUP_STEPS)].sort((a, b) => a.percent - b.percent);
  const fixed = input.rounding === "increment";
  if (!hasWarmupRamp(exerciseType) || !Number.isFinite(workingKg) || workingKg <= 0) return [];
  const bar = equipment === "barbell" ? loading.bar : null;
  const rawStep = loading.stepKg ?? DEFAULT_STEP[unit];
  const stepKg = rawStep > 0 ? rawStep : DEFAULT_STEP[unit];

  let round: (kg: number) => number;
  let opener: WarmupSet;
  if (loading.grid) {
    const grid = loading.grid;
    round = (kg) => grid.nearest(kg);
    opener = {
      weightKg: round(workingKg * OPENER.barless.fraction),
      reps: OPENER.barless.reps,
    };
  } else if (bar) {
    const step = smallestBarStepKg(bar.plates);
    if (step === null || workingKg <= bar.weightKg + step + SAME) return [];
    round = fixed ? (kg) => roundToStep(kg, stepKg) : (kg) => nearestBarLoadKg(kg, bar, bar.plates);
    opener = { weightKg: bar.weightKg, reps: OPENER.bar.reps };
  } else {
    if (workingKg <= 2 * stepKg + SAME) return [];
    round = (kg) => roundToStep(kg, stepKg);
    opener = {
      weightKg: round(workingKg * OPENER.barless.fraction),
      reps: OPENER.barless.reps,
    };
  }

  const gymCap = loading.capKg ?? loading.grid?.capKg;
  const ramp: WarmupSet[] = [];
  const candidates: { weightKg: number; reps: number; cap: number }[] = [
    { ...opener, cap: 1 },
    ...steps.map((s) => ({
      weightKg: round((workingKg * s.percent) / 100),
      reps: s.reps,
      cap: capOf(s.percent / 100),
    })),
  ];
  for (const { cap, ...candidate } of candidates) {
    const last = ramp.at(-1);
    if (candidate.weightKg <= SAME || candidate.weightKg >= workingKg - SAME) continue;
    if (candidate.weightKg > workingKg * cap + SAME) continue;
    if (gymCap != null && candidate.weightKg > gymCap) continue;
    if (last && candidate.weightKg <= last.weightKg + SAME) continue;
    ramp.push(candidate);
  }
  return ramp;
}
