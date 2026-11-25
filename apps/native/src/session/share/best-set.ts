import { addsLoad, formatWeight, type ExerciseType, type WeightUnit } from "@workspace/shared";
import type { SessionSetDetail } from "@workspace/sync";

import { formatElapsed } from "../timer/clock";

/** The numbers of the set a row shows as "best", with the fields the exercise does not log empty. */
export type BestSet = {
  weightKg: number | null;
  reps: number | null;
  durationS: number | null;
  distanceM: number | null;
  floors: number | null;
  steps: number | null;
};

/** What a row says after its set count. */
export type RowDetail =
  /** "best 100 kg × 5"; `addedLoad` writes the weight with a plus ("+20 kg × 8"). */
  | { kind: "best"; set: BestSet; addedLoad: boolean }
  /** "5–8 reps": the rep range, when weights are hidden. */
  | { kind: "reps"; min: number; max: number };

type CountedSet = Pick<
  SessionSetDetail,
  "weightKg" | "reps" | "durationS" | "distanceM" | "floors" | "steps"
>;

const empty: BestSet = {
  weightKg: null,
  reps: null,
  durationS: null,
  distanceM: null,
  floors: null,
  steps: null,
};

const value = (n: number | null) => n ?? 0;

/** Larger first: by each key in turn. */
function heaviest<Set extends CountedSet>(
  sets: readonly Set[],
  keys: readonly ((set: Set) => number)[],
): Set | null {
  let best: Set | null = null;
  for (const set of sets) {
    if (best === null) {
      best = set;
      continue;
    }
    for (const key of keys) {
      const difference = key(set) - key(best);
      if (difference === 0) continue;
      if (difference > 0) best = set;
      break;
    }
  }
  return best;
}

/**
 * The best of an exercise's Counted sets (ticked, no warm-ups): the heaviest for weight and reps
 * (ties by reps), the most reps for bodyweight, assisted and rep-only exercises, otherwise the
 * longest. Bodyweight and assistance never appear: those types show reps only. A weighted
 * bodyweight set is ranked by its added load, like weight and reps.
 */
export function bestSet(type: ExerciseType, counted: readonly CountedSet[]): BestSet | null {
  switch (type) {
    case "weight_reps":
    case "bodyweight_weighted_reps": {
      const best = heaviest(counted, [(s) => value(s.weightKg), (s) => value(s.reps)]);
      if (!best) return null;
      return {
        ...empty,
        weightKg: value(best.weightKg) > 0 ? best.weightKg : null,
        reps: best.reps,
      };
    }
    case "short_distance_weight": {
      const best = heaviest(counted, [(s) => value(s.weightKg), (s) => value(s.distanceM)]);
      if (!best) return null;
      return {
        ...empty,
        weightKg: value(best.weightKg) > 0 ? best.weightKg : null,
        distanceM: best.distanceM,
      };
    }
    case "reps_only":
    case "bodyweight_reps":
    case "bodyweight_assisted_reps": {
      const best = heaviest(counted, [(s) => value(s.reps)]);
      return best ? { ...empty, reps: best.reps } : null;
    }
    case "duration": {
      const best = heaviest(counted, [(s) => value(s.durationS)]);
      return best ? { ...empty, durationS: best.durationS } : null;
    }
    case "distance_duration": {
      const best = heaviest(counted, [(s) => value(s.distanceM), (s) => value(s.durationS)]);
      return best ? { ...empty, distanceM: best.distanceM, durationS: best.durationS } : null;
    }
    case "floors_duration": {
      const best = heaviest(counted, [(s) => value(s.floors), (s) => value(s.durationS)]);
      return best ? { ...empty, floors: best.floors, durationS: best.durationS } : null;
    }
    case "steps_duration": {
      const best = heaviest(counted, [(s) => value(s.steps), (s) => value(s.durationS)]);
      return best ? { ...empty, steps: best.steps, durationS: best.durationS } : null;
    }
  }
}

/**
 * What a row shows for an exercise: its best set, or with weights hidden the rep range for weight
 * and reps ("5–8 reps") and the best set without its weight otherwise. Null when nothing counted.
 */
export function rowDetail(
  type: ExerciseType,
  counted: readonly CountedSet[],
  showWeights: boolean,
): RowDetail | null {
  const best = bestSet(type, counted);
  if (!best) return null;
  const addedLoad = addsLoad(type);
  if (showWeights) return { kind: "best", set: best, addedLoad };
  if (type === "weight_reps" || addedLoad) {
    const reps = counted.flatMap((set) => (set.reps ? [set.reps] : []));
    if (reps.length === 0) return null;
    return { kind: "reps", min: Math.min(...reps), max: Math.max(...reps) };
  }
  return { kind: "best", set: { ...best, weightKg: null }, addedLoad };
}

/** The words a row's numbers are written with; the caller supplies them from its locale. */
export type BestLabels = {
  unit: WeightUnit;
  unitLabel: (unit: WeightUnit) => string;
  reps: (count: number) => string;
  distance: (meters: number) => string;
  floors: (count: number) => string;
  steps: (count: number) => string;
  repRange: (min: number, max: number) => string;
  /** "{{weight}} {{unit}} × {{reps}}" */
  weightReps: (weight: string, reps: number, unit: WeightUnit) => string;
};

/** A row's detail as text: "100 kg × 5", "12 reps", "5–8 reps", "2000 m · 8:30". */
export function formatDetail(detail: RowDetail, labels: BestLabels): string {
  if (detail.kind === "reps") return labels.repRange(detail.min, detail.max);
  const { set } = detail;
  const shown = (kg: number) => `${detail.addedLoad ? "+" : ""}${formatWeight(kg, labels.unit)}`;
  const weight =
    set.weightKg === null ? null : `${shown(set.weightKg)} ${labels.unitLabel(labels.unit)}`;
  if (set.weightKg !== null && set.reps !== null && set.reps > 0) {
    return labels.weightReps(shown(set.weightKg), set.reps, labels.unit);
  }
  return [
    weight,
    set.reps ? labels.reps(set.reps) : null,
    set.distanceM ? labels.distance(set.distanceM) : null,
    set.floors ? labels.floors(set.floors) : null,
    set.steps ? labels.steps(set.steps) : null,
    set.durationS ? formatElapsed(set.durationS) : null,
  ]
    .filter((part) => part !== null)
    .join(" · ");
}
