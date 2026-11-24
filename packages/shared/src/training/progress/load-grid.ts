import { z } from "zod";

import type { Equipment } from "../../exercise/vocabulary";
import { MAX_WEIGHT_KG } from "../vocabulary/vocabulary";
import { loadBar, nearestBarLoadKg, smallestBarStepKg, type LoadPlate } from "../plates/plates";

/**
 * One run of loads a gym offers for an exercise: `min`, `min + step`, ... up to `max`, in
 * kilograms. A `max` of null runs on without a cap (only the last range may). A cable stack of
 * 5 to 90 kg by 5 is one range; a dumbbell rack of 1 to 10 kg by 1, then 12.5 kg and up by 2.5, is
 * two. The last range's `max` is the exercise's cap at that gym.
 */
export const loadRangeSchema = z.strictObject({
  min: z.number().min(0).max(MAX_WEIGHT_KG),
  max: z.number().positive().max(MAX_WEIGHT_KG).nullable(),
  step: z.number().min(0.05).max(MAX_WEIGHT_KG),
});
export type LoadRange = z.infer<typeof loadRangeSchema>;

/** At most this many ranges per gym and exercise (the schema holds more than the editor shows). */
export const LOAD_RANGES_MAX = 8;

/**
 * Ranges in ascending order, each starting where the previous one starts or later, only the last
 * one without a cap, and each with room for at least one load.
 */
export const loadRangesSchema = z
  .array(loadRangeSchema)
  .max(LOAD_RANGES_MAX)
  .refine(
    (ranges) =>
      ranges.every(
        (range, index) =>
          (range.max === null ? index === ranges.length - 1 : range.max >= range.min) &&
          (index === 0 || range.min >= (ranges[index - 1]?.min ?? 0)),
      ),
    "Ranges must ascend, and only the last may be open-ended",
  );

/** Within this many kilograms two loads are the same one. */
const EPS = 1e-4;

/** What a load is measured as: per dumbbell or kettlebell, per side of a bar, or the whole load. */
export const LOAD_BASES = ["per_hand", "per_side", "total"] as const;
export type LoadBasis = (typeof LOAD_BASES)[number];

/**
 * How an exercise's logged load reads, so a cap has one meaning: a dumbbell or kettlebell is the
 * weight of one in a hand. Everything else is the whole load as the lifter counts it. `per_side`
 * is part of the vocabulary for plate-loaded machines logged one side at a time; no equipment
 * implies it today because the catalog does not say how a plate-loaded machine is logged.
 */
export function loadBasisOf(equipment: Equipment): LoadBasis {
  return equipment === "dumbbell" || equipment === "kettlebell" ? "per_hand" : "total";
}

/**
 * The loads a gym can make for one exercise. Without one (`null` in the functions below) loads
 * step by the equipment's default.
 */
export type LoadGrid = {
  /** `gym`: the gym's ranges for this exercise. `kit`: the bar and plates of the gym. */
  readonly source: "gym" | "kit";
  /** The most the exercise may be loaded to at this gym; null for no cap. */
  readonly capKg: number | null;
  /** The loadable weight nearest `kg`; the lower on a tie. */
  nearest(kg: number): number;
  /** The smallest loadable weight above `kg`; null when there is none. */
  above(kg: number): number | null;
  /** The greatest loadable weight below `kg`; null when there is none. */
  below(kg: number): number | null;
  /** The change one step up from `kg` makes. */
  stepAt(kg: number): number;
};

const clean = (kg: number) => Number(kg.toFixed(6));

/** The grid of explicit ranges. Empty ranges give no grid. */
export function rangeGrid(ranges: readonly LoadRange[]): LoadGrid | null {
  const first = ranges[0];
  if (!first) return null;
  const last = ranges[ranges.length - 1] ?? first;
  const atOrBelow = (kg: number): number | null => {
    let best: number | null = null;
    for (const range of ranges) {
      if (kg < range.min - EPS) continue;
      const top = Math.min(kg, range.max ?? kg);
      const point = clean(
        range.min + Math.floor((top - range.min + EPS) / range.step) * range.step,
      );
      if (best === null || point > best) best = point;
    }
    return best;
  };
  const atOrAbove = (kg: number): number | null => {
    let best: number | null = null;
    for (const range of ranges) {
      const point =
        kg <= range.min + EPS
          ? range.min
          : clean(range.min + Math.ceil((kg - range.min - EPS) / range.step) * range.step);
      if (range.max !== null && point > range.max + EPS) continue;
      if (best === null || point < best) best = point;
    }
    return best;
  };
  const below = (kg: number) => atOrBelow(kg - 2 * EPS);
  const above = (kg: number) => atOrAbove(kg + 2 * EPS);
  return {
    source: "gym",
    capKg: last.max,
    below,
    above,
    nearest(kg) {
      const lower = atOrBelow(kg);
      const upper = atOrAbove(kg);
      if (lower === null) return upper ?? kg;
      if (upper === null) return lower;
      return kg - lower <= upper - kg + EPS ? lower : upper;
    },
    stepAt(kg) {
      const range = [...ranges].reverse().find((candidate) => kg >= candidate.min - EPS) ?? first;
      return range.step;
    },
  };
}

/** The grid of a loaded bar: the bar and the plates the gym has, pairs of them. */
export function barGrid(bar: { weightKg: number }, plates: readonly LoadPlate[]): LoadGrid | null {
  const smallest = smallestBarStepKg(plates);
  if (smallest === null) return null;
  const aboveCache = new Map<number, number | null>();
  const belowCache = new Map<number, number | null>();
  const above = (kg: number) => {
    const key = clean(kg);
    if (!aboveCache.has(key))
      aboveCache.set(key, loadBar(Math.max(0, kg + 0.01), bar, plates).above?.totalKg ?? null);
    return aboveCache.get(key) ?? null;
  };
  return {
    source: "kit",
    capKg: null,
    above,
    below(kg) {
      const key = clean(kg);
      if (!belowCache.has(key))
        belowCache.set(
          key,
          kg - 0.01 < 0 ? null : (loadBar(kg - 0.01, bar, plates).below?.totalKg ?? null),
        );
      return belowCache.get(key) ?? null;
    },
    nearest: (kg) => nearestBarLoadKg(Math.max(0, kg), bar, plates),
    stepAt: (kg) => Math.max(smallest, (above(kg) ?? kg + smallest) - kg),
  };
}

/**
 * The grid a gym gives an exercise: its own ranges when it has set them, else the loads of the
 * gym's bar and plates for a barbell, else none (the equipment's default step applies).
 */
export function loadGridOf(input: {
  equipment: Equipment;
  ranges?: readonly LoadRange[] | null;
  bar?: { weightKg: number } | null;
  plates?: readonly LoadPlate[];
}): LoadGrid | null {
  const explicit = rangeGrid(input.ranges ?? []);
  if (explicit) return explicit;
  return input.equipment === "barbell" && input.bar ? barGrid(input.bar, input.plates ?? []) : null;
}

/**
 * Ranges for the two-field form, "Max load" and "Load step". A step makes one range from it to the
 * cap; a cap alone keeps the `defaults` up to the cap, so a dumbbell rack keeps its 1 kg steps
 * below 10 kg. Neither gives no ranges.
 */
export function rangesFromLimits(
  limits: { maxKg: number | null; stepKg: number | null },
  defaults: readonly LoadRange[],
): LoadRange[] {
  const { maxKg, stepKg } = limits;
  if (stepKg !== null) return [{ min: stepKg, max: maxKg, step: stepKg }];
  if (maxKg === null) return [];
  const kept = defaults.filter((range) => range.min < maxKg - EPS);
  const clipped = kept.map((range) =>
    range.max === null || range.max > maxKg ? { ...range, max: maxKg } : range,
  );
  return clipped.length > 0 ? clipped : [{ min: 0, max: maxKg, step: defaults[0]?.step ?? 1 }];
}

/**
 * The two fields of a gym's ranges: the cap and the step the last range climbs by. More than one
 * range is read as its cap and last step; the editor shows no more than that for now.
 */
export function limitsOfRanges(ranges: readonly LoadRange[]): {
  maxKg: number | null;
  stepKg: number | null;
} {
  const last = ranges[ranges.length - 1];
  return last ? { maxKg: last.max, stepKg: last.step } : { maxKg: null, stepKg: null };
}
