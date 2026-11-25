import { z } from "zod";

import { loadIdentity } from "../vocabulary/format";
import type { Equipment } from "../../exercise/vocabulary";
import { MAX_WEIGHT_KG, type WeightUnit } from "../vocabulary/vocabulary";
import { loadBar, nearestBarLoadKg, smallestBarStepKg, type LoadPlate } from "../plates/plates";
import { defaultRangesFor, defaultStepKg } from "./progression-steps";

/**
 * One run of loads a gym offers for an exercise: `min`, `min + step`, ... up to `max`, in
 * kilograms. A `max` of null runs on without a cap (only the last range may). A cable stack of
 * 5 to 90 kg by 5 is one range; a dumbbell rack of 1 to 10 kg by 1, then 12.5 kg and up by 2.5, is
 * two. The last range's `max` is the exercise's cap at that gym. A `step` of null is a cap with no
 * step of its own: below it the kit, the default rack or the equipment's step still apply (see
 * {@link loadGridOf}); it is the only range then.
 */
export const loadRangeSchema = z.strictObject({
  min: z.number().min(0).max(MAX_WEIGHT_KG),
  max: z.number().positive().max(MAX_WEIGHT_KG).nullable(),
  step: z.number().min(0.05).max(MAX_WEIGHT_KG).nullable(),
});
export type LoadRange = z.infer<typeof loadRangeSchema>;
/** A range with a step of its own. */
export type SteppedRange = LoadRange & { step: number };

/** At most this many ranges per gym and exercise (the schema holds more than the editor shows). */
export const LOAD_RANGES_MAX = 8;

/**
 * Ranges in ascending order, each starting where the previous one starts or later, only the last
 * one without a cap, and each with room for at least one load. A range without a step is a lone
 * cap.
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
  )
  .refine(
    (ranges) =>
      ranges.every((range) => range.step !== null) ||
      (ranges.length === 1 && ranges[0]?.max !== null),
    "A range without a step is a lone cap",
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
  /**
   * `gym`: the gym's own ranges for this exercise, whose step is the step. `kit`: the bar and
   * plates of the gym. `default`: the equipment's usual rack, such as a dumbbell rack. `cap`: no
   * grid, only a cap over the equipment's default stepping. Only `gym` overrides a manual
   * increment.
   */
  readonly source: "gym" | "kit" | "default" | "cap";
  /** The most the exercise may be loaded to at this gym; null for no cap. */
  readonly capKg: number | null;
  /** The available plates determine the limit. */
  readonly plateLimit?: boolean;
  /** The loadable weight nearest `kg`; the lower on a tie. */
  nearest(kg: number): number;
  /** The smallest loadable weight above `kg`; null when there is none. */
  above(kg: number): number | null;
  /** The greatest loadable weight below `kg`; null when there is none. */
  below(kg: number): number | null;
  /** The change one step up from `kg` makes. */
  stepAt(kg: number): number;
};

/** Use the exact grid coordinate when storage rounding moved a logged weight off it. */
export function alignToGrid(grid: LoadGrid, kg: number): number {
  const nearest = grid.nearest(kg);
  return loadIdentity(nearest) === loadIdentity(kg) ? nearest : kg;
}

/** Round down at logged precision, stopping at the lowest point. */
export function gridFloor(grid: LoadGrid, kg: number): number {
  const nearest = grid.nearest(kg);
  return loadIdentity(nearest) <= loadIdentity(kg) ? nearest : (grid.below(kg) ?? nearest);
}

const clean = (kg: number) => Number(kg.toFixed(6));

/** The ranges when every one has a step of its own; else null. */
const steppedOf = (ranges: readonly LoadRange[]): SteppedRange[] | null => {
  const stepped = ranges.flatMap((range): SteppedRange[] =>
    range.step === null ? [] : [{ ...range, step: range.step }],
  );
  return stepped.length === ranges.length ? stepped : null;
};

/** The cap of a lone range without a step; null for any other ranges. */
export function capOnlyOf(ranges: readonly LoadRange[]): number | null {
  const only = ranges[0];
  return ranges.length === 1 && only?.step === null ? only.max : null;
}

/** The grid of explicit ranges. Empty ranges, and a cap without a step, give no grid. */
export function rangeGrid(
  input: readonly LoadRange[],
  source: "gym" | "default" = "gym",
): LoadGrid | null {
  const ranges = steppedOf(input);
  const first = ranges?.[0];
  if (!ranges || !first) return null;
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
  const limit = last.max === null ? null : Math.max(...ranges.map((range) => range.max ?? 0));
  return {
    source,
    capKg: limit === null ? null : Math.min(limit, atOrBelow(limit) ?? limit),
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
      for (let index = ranges.length - 1; index >= 0; index -= 1) {
        const range = ranges[index];
        if (!range || kg < range.min - EPS) continue;
        const next = ranges[index + 1];
        return next && range.max !== null && kg >= range.max - EPS ? next.step : range.step;
      }
      return first.step;
    },
  };
}

/** The grid of a loaded bar: the bar and the plates the gym has, pairs of them. */
export function barGrid(bar: { weightKg: number }, plates: readonly LoadPlate[]): LoadGrid | null {
  const smallest = smallestBarStepKg(plates);
  if (smallest === null) return null;
  const available = plates.filter(
    (plate) =>
      Number.isFinite(plate.weightKg) &&
      plate.weightKg > 0 &&
      (plate.count === null || plate.count > 0),
  );
  const capKg = available.some((plate) => plate.count === null)
    ? null
    : clean(
        available.reduce(
          (total, plate) => total + 2 * plate.weightKg * (plate.count ?? 0),
          bar.weightKg,
        ),
      );
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
    capKg,
    plateLimit: capKg !== null,
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

/** `base` held to a cap: no load above it, and the cap itself when the next load would pass it. */
function capGrid(base: LoadGrid | null, capKg: number, stepAt: (kg: number) => number): LoadGrid {
  const held = (kg: number) => Math.min(kg, capKg);
  return {
    source: base?.source ?? "cap",
    capKg,
    plateLimit: base?.plateLimit && base.capKg === capKg,
    nearest: (kg) => held(base ? base.nearest(kg) : kg),
    above(kg) {
      if (kg >= capKg - EPS) return null;
      return held(base ? (base.above(kg) ?? capKg) : clean(kg + stepAt(kg)));
    },
    below(kg) {
      if (kg > capKg + EPS) return capKg;
      if (base) return base.below(kg);
      return kg - stepAt(kg) > EPS ? clean(kg - stepAt(kg)) : null;
    },
    stepAt: (kg) => (base ? base.stepAt(kg) : stepAt(kg)),
  };
}

/**
 * `ranges` held to a cap of `capKg`: ranges that start above it go, and the last one ends at it.
 * No ranges become a lone cap. The result stays valid for {@link loadRangesSchema}.
 */
export function limitRangesTo(ranges: readonly LoadRange[], capKg: number): LoadRange[] {
  const kept = ranges.filter((range) => range.min <= capKg + EPS);
  if (kept.length === 0) return [{ min: 0, max: capKg, step: null }];
  // Ranges may overlap, so every one ends at the cap, not only the last.
  return kept.map((range) => ({ ...range, max: Math.min(range.max ?? capKg, capKg) }));
}

/**
 * The ranges a gym gives an exercise: its own for that exercise, and for a dumbbell exercise held
 * to the gym's dumbbell max. The lower of the two caps wins, so an exercise limit below the
 * dumbbell max stays as it is.
 */
export function gymRangesFor(input: {
  equipment: Equipment;
  ranges?: readonly LoadRange[] | null;
  dumbbellMaxKg?: number | null;
}): readonly LoadRange[] {
  const ranges = input.ranges ?? [];
  const cap = input.dumbbellMaxKg ?? null;
  if (input.equipment !== "dumbbell" || cap === null) return ranges;
  // Ranges may overlap and need not end in order, so the exercise's own top is the highest max.
  let own: number | null = null;
  for (const range of ranges) {
    if (range.max === null) {
      own = null;
      break;
    }
    own = own === null ? range.max : Math.max(own, range.max);
  }
  const effective = own === null ? cap : Math.min(own, cap);
  const within = ranges.every((range) => range.max !== null && range.max <= effective + EPS);
  return ranges.length > 0 && within ? ranges : limitRangesTo(ranges, effective);
}

/**
 * The grid a gym gives an exercise. Its own ranges when it has set a step, else the loads the
 * equipment has without a setting (the loaded bar of a barbell, the usual rack of a dumbbell,
 * nothing for the rest), held to the gym's cap when it has set one (an exercise's own, or the
 * gym's dumbbell max for dumbbell exercises, whichever is lower).
 */
export function loadGridOf(input: {
  equipment: Equipment;
  unit: WeightUnit;
  ranges?: readonly LoadRange[] | null;
  /** The most any dumbbell exercise is loaded to at this gym, in kilograms. */
  dumbbellMaxKg?: number | null;
  /** The bar this exercise loads, already resolved (see `defaultBar`). */
  bar?: { weightKg: number } | null;
  plates?: readonly LoadPlate[];
}): LoadGrid | null {
  const ranges = gymRangesFor(input);
  const explicit = rangeGrid(ranges);
  if (explicit) return explicit;
  const base =
    input.equipment === "barbell"
      ? input.bar
        ? barGrid(input.bar, input.plates ?? [])
        : null
      : input.equipment === "dumbbell"
        ? rangeGrid(defaultRangesFor("dumbbell", input.unit), "default")
        : null;
  const cap = capOnlyOf(ranges);
  if (cap === null) return base;
  const limit = base?.source === "kit" ? gridFloor(base, cap) : cap;
  return capGrid(base, limit, (kg) => defaultStepKg(input.equipment, input.unit, kg));
}

const sameKg = (a: number | null, b: number | null) =>
  a === b || (a !== null && b !== null && Math.abs(a - b) < EPS);

/**
 * Ranges for the two-field form, "Max load" and "Load step". Without a step it is a cap alone:
 * the kit, the default rack or the equipment's step still apply below it. With the step the
 * ranges already hold, only the cap moves: the last range is clipped or extended and the rest
 * stay, so a rack of 1 kg and 2.5 kg steps keeps both. A new step makes one range from it to the
 * cap. Neither gives no ranges.
 */
export function rangesFromLimits(
  limits: { maxKg: number | null; stepKg: number | null },
  current: readonly LoadRange[] = [],
): LoadRange[] {
  const { maxKg, stepKg } = limits;
  if (stepKg === null) return maxKg === null ? [] : [{ min: 0, max: maxKg, step: null }];
  if (sameKg(limitsOfRanges(current).stepKg, stepKg)) {
    const kept = current.filter((range) => maxKg === null || range.min <= maxKg);
    const last = kept[kept.length - 1];
    if (last) return [...kept.slice(0, -1), { ...last, max: maxKg }];
  }
  return [{ min: stepKg, max: maxKg, step: stepKg }];
}

/**
 * The two fields of a gym's ranges: the cap and the step the last range climbs by (null for a
 * cap alone). More than one range is read as its cap and last step; the editor shows no more.
 */
export function limitsOfRanges(ranges: readonly LoadRange[]): {
  maxKg: number | null;
  stepKg: number | null;
} {
  const last = ranges[ranges.length - 1];
  return last ? { maxKg: last.max, stepKg: last.step } : { maxKg: null, stepKg: null };
}
