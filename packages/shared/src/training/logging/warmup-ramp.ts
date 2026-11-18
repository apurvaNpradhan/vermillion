import { KG_PER_LB } from "../vocabulary/format";
import type { ExerciseType, Equipment } from "../../exercise/vocabulary";
import type { WeightUnit } from "../vocabulary/vocabulary";
import { nearestBarLoadKg, smallestBarStepKg, type LoadPlate } from "../plates/plates";

/** One generated warm-up set: a load in kilograms and a rep count. */
export type WarmupSet = { weightKg: number; reps: number };

/**
 * How much the user can load. A barbell with a known bar loads in plate pairs; everything else
 * (dumbbells, machines, kettlebells, a barbell with no bar) rounds to a step, `stepKg`, which
 * defaults to 2.5 kg or 5 lb.
 */
export type WarmupLoading = {
  bar: { weightKg: number; plates: readonly LoadPlate[] } | null;
  stepKg?: number | null;
};

const DEFAULT_STEP = { kg: 2.5, lb: 5 * KG_PER_LB } as const satisfies Record<WeightUnit, number>;
const SAME = 0.0005;

/**
 * The ramp: the opener (the bar, or 40% when there is no bar) for 10, then 50% for 5, 70% for 3
 * and 85% for 1 of the working weight. `cap` is the most a step may be of the working weight after
 * rounding; a coarse kit whose nearest load is above it skips the step, so a set of five is never
 * near the working weight.
 */
const PERCENT_STEPS = [
  { fraction: 0.5, reps: 5, cap: 0.6 },
  { fraction: 0.7, reps: 3, cap: 0.8 },
  { fraction: 0.85, reps: 1, cap: 0.92 },
] as const;
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
}): WarmupSet[] {
  const { workingKg, exerciseType, equipment, unit, loading } = input;
  if (!hasWarmupRamp(exerciseType) || !Number.isFinite(workingKg) || workingKg <= 0) return [];
  const bar = equipment === "barbell" ? loading.bar : null;
  const rawStep = loading.stepKg ?? DEFAULT_STEP[unit];
  const stepKg = rawStep > 0 ? rawStep : DEFAULT_STEP[unit];

  let round: (kg: number) => number;
  let opener: WarmupSet;
  if (bar) {
    const step = smallestBarStepKg(bar.plates);
    if (step === null || workingKg <= bar.weightKg + step + SAME) return [];
    round = (kg) => nearestBarLoadKg(kg, bar, bar.plates);
    opener = { weightKg: bar.weightKg, reps: OPENER.bar.reps };
  } else {
    if (workingKg <= 2 * stepKg + SAME) return [];
    round = (kg) => roundToStep(kg, stepKg);
    opener = {
      weightKg: round(workingKg * OPENER.barless.fraction),
      reps: OPENER.barless.reps,
    };
  }

  const ramp: WarmupSet[] = [];
  const candidates: { weightKg: number; reps: number; cap: number }[] = [
    { ...opener, cap: 1 },
    ...PERCENT_STEPS.map((s) => ({
      weightKg: round(workingKg * s.fraction),
      reps: s.reps,
      cap: s.cap,
    })),
  ];
  for (const { cap, ...candidate } of candidates) {
    const last = ramp.at(-1);
    if (candidate.weightKg <= SAME || candidate.weightKg >= workingKg - SAME) continue;
    if (candidate.weightKg > workingKg * cap + SAME) continue;
    if (last && candidate.weightKg <= last.weightKg + SAME) continue;
    ramp.push(candidate);
  }
  return ramp;
}
