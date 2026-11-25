import type { Equipment } from "../../exercise/vocabulary";
import {
  KG_PER_LB,
  formatWeight,
  loadIdentity,
  parseWeight,
  weightAtMost,
} from "../vocabulary/format";
import type { WeightUnit } from "../vocabulary/vocabulary";
import { alignToGrid, gridFloor, type LoadGrid, type SteppedRange } from "./load-grid";

/**
 * The smallest load change that equipment can make, in the display unit: a barbell with the
 * smallest plates adds 2.5 kg (5 lb) a side pair, a kettlebell steps by 2 kg (5 lb). Plates held
 * in the hand, the EZ and trap bars and the Smith machine step like a barbell. Everything else
 * (machines, cables, bands, suspension, no equipment) has fine adjustment, so 1 kg (2.5 lb). A
 * dumbbell rack is the exception, see {@link DUMBBELL_STEPS}.
 */
const SMALLEST_STEP = {
  barbell: { kg: 2.5, lb: 5 },
  ez_bar: { kg: 2.5, lb: 5 },
  trap_bar: { kg: 2.5, lb: 5 },
  smith_machine: { kg: 2.5, lb: 5 },
  plate: { kg: 2.5, lb: 5 },
  kettlebell: { kg: 2, lb: 5 },
  dumbbell: { kg: 1, lb: 2.5 },
  machine: { kg: 1, lb: 2.5 },
  cable: { kg: 1, lb: 2.5 },
  resistance_band: { kg: 1, lb: 2.5 },
  suspension: { kg: 1, lb: 2.5 },
  none: { kg: 1, lb: 2.5 },
  other: { kg: 1, lb: 2.5 },
} as const satisfies Record<Equipment, Record<WeightUnit, number>>;

/**
 * A dumbbell rack steps finely up to a light weight, then by a plate-sized jump: 1 kg up to 10 kg
 * and 2.5 kg above it; 2.5 lb up to 25 lb and 5 lb above it. `upTo` is in the unit.
 */
const DUMBBELL_STEPS = {
  kg: { fine: 1, coarse: 2.5, upTo: 10 },
  lb: { fine: 2.5, coarse: 5, upTo: 25 },
} as const satisfies Record<WeightUnit, { fine: number; coarse: number; upTo: number }>;

/** An automatic increment is this share of the set's load, before rounding to a step. */
const INCREMENT_SHARE = 0.025;
const EPS = 1e-4;

const inUnit = (kg: number, unit: WeightUnit) => (unit === "kg" ? kg : kg / KG_PER_LB);
const toKg = (value: number, unit: WeightUnit) => (unit === "kg" ? value : value * KG_PER_LB);

/** Manual increment choices in each display unit. */
export const INCREMENT_CHOICES = {
  kg: [1, 1.25, 2, 2.5, 5],
  lb: [1, 2.5, 5, 10],
} as const satisfies Record<WeightUnit, readonly number[]>;

/** Preserve a same-unit increment. Across units, use the closest nominal choice. */
export function incrementInUnit(
  kilograms: number | null,
  from: WeightUnit,
  to: WeightUnit,
): number | null {
  if (kilograms === null || from === to) return kilograms;
  const amount = inUnit(kilograms, to);
  const choices: readonly number[] = INCREMENT_CHOICES[to];
  const closest = choices.reduce((best, choice) =>
    Math.abs(choice - amount) < Math.abs(best - amount) ? choice : best,
  );
  return toKg(closest, to);
}

/** The default step of `equipment` for a load of `loadKg`, in the display unit. */
function defaultStep(equipment: Equipment, unit: WeightUnit, loadKg: number): number {
  if (equipment !== "dumbbell") return SMALLEST_STEP[equipment][unit];
  const steps = DUMBBELL_STEPS[unit];
  return inUnit(loadKg, unit) < steps.upTo - EPS ? steps.fine : steps.coarse;
}

/** The default step of `equipment` for a load of `loadKg`, in kilograms. */
export function defaultStepKg(equipment: Equipment, unit: WeightUnit, loadKg: number): number {
  return toKg(defaultStep(equipment, unit, loadKg), unit);
}

/**
 * The loads of `equipment` when no gym setting or kit says otherwise, as ranges in kilograms: one
 * range from the smallest step up, two for a dumbbell rack. A loaded barbell starts at its bar and
 * steps by its smallest pair of plates.
 */
export function defaultRangesFor(
  equipment: Equipment,
  unit: WeightUnit,
  bar: { weightKg: number; stepKg: number } | null = null,
): SteppedRange[] {
  if (equipment === "barbell" && bar)
    return [{ min: bar.weightKg + bar.stepKg, max: null, step: bar.stepKg }];
  if (equipment === "dumbbell") {
    const steps = DUMBBELL_STEPS[unit];
    const fine = toKg(steps.fine, unit);
    const coarse = toKg(steps.coarse, unit);
    const boundary = toKg(steps.upTo, unit);
    return [
      { min: fine, max: boundary, step: fine },
      { min: boundary + coarse, max: null, step: coarse },
    ];
  }
  const step = toKg(SMALLEST_STEP[equipment][unit], unit);
  return [{ min: step, max: null, step }];
}

/**
 * A weight as typing it would store it, so a suggestion ticked as a Ghost matches a typed one;
 * with a gym's `grid`, the nearest load that gym can make.
 */
export function loadable(kg: number, unit: WeightUnit, grid: LoadGrid | null = null) {
  const snapped = grid ? grid.nearest(kg) : kg;
  return parseWeight(formatWeight(snapped, unit), unit) ?? snapped;
}

/** A physical grid point is still the same load when a typed value rounds by half a gram. */
export function gridCapInUnit(grid: LoadGrid | null, unit: WeightUnit): number | null {
  const cap = grid?.capKg;
  if (cap == null) return null;
  const typed = loadable(cap, unit);
  return grid?.source !== "cap" && loadIdentity(typed) === loadIdentity(cap)
    ? Math.min(typed, cap)
    : weightAtMost(cap, unit, cap);
}

/**
 * The increment for a set at `loadKg`, in kilograms. A gym's own step for the exercise comes
 * first; else a manual setting always wins (a cap alone changes neither); otherwise the step is
 * the loaded bar's, the rack's or the equipment's. Automatically it is about 2.5% of the load,
 * rounded to a multiple of the step and never below it.
 */
export function incrementFor(
  loadKg: number | null,
  equipment: Equipment,
  settings: { weightUnit: WeightUnit; weightIncrementKg: number | null },
  grid: LoadGrid | null = null,
): number {
  const load = loadKg ?? 0;
  if (grid?.source === "gym") return automatic(load, grid.stepAt(alignToGrid(grid, load)));
  if (settings.weightIncrementKg !== null) return settings.weightIncrementKg;
  if (grid && grid.source !== "cap") return automatic(load, grid.stepAt(alignToGrid(grid, load)));
  const unit = settings.weightUnit;
  const step = defaultStep(equipment, unit, load);
  const raw = inUnit(load, unit) * INCREMENT_SHARE;
  return toKg(Math.max(step, Math.round(raw / step) * step), unit);
}

/** 2.5% of the load in whole steps of `stepKg`, at least one. */
const automatic = (loadKg: number, stepKg: number) =>
  Math.max(stepKg, Math.round((loadKg * INCREMENT_SHARE) / stepKg) * stepKg);

/**
 * The load `addedKg` above `loadKg`, as the gym can make it. Without a grid it is the sum, as a
 * typed weight. With one it is the nearest load the grid has, at least one step up, and never
 * above the cap: when the next load would pass the cap (or the grid has no more), the cap itself.
 * Null when the load is already at the cap, or there is no higher load.
 */
export function addLoad(
  loadKg: number,
  addedKg: number,
  unit: WeightUnit,
  grid: LoadGrid | null = null,
): number | null {
  if (!grid) return loadable(loadKg + addedKg, unit);
  const cap = grid.capKg;
  if (cap !== null && loadKg >= cap) return null;
  const start = alignToGrid(grid, loadKg);
  let next: number | null = grid.nearest(start + addedKg);
  if (loadIdentity(next) <= loadIdentity(start)) next = grid.above(start);
  if (cap !== null && (next === null || next > cap)) next = cap;
  if (next === null) return null;
  const typed = loadable(next, unit);
  const nextKg =
    cap === null || typed <= cap
      ? typed
      : loadIdentity(typed) === loadIdentity(cap)
        ? cap
        : weightAtMost(next, unit, cap);
  return nextKg > loadKg ? nextKg : null;
}

/**
 * `factor` of a load (0.9 for 90%), rounded to the equipment's step (or the gym's grid) and
 * at least one point down when a lower point exists. Zero stays zero.
 *
 * A break or Lighter week rounds to the nearest point and scales loads already below the grid
 * as entered. A phase's Deload rounds down, with the lowest loadable point as its floor.
 * The physical cap applies in either case.
 */
export function lightenLoad(
  loadKg: number,
  factor: number,
  equipment: Equipment,
  unit: WeightUnit,
  grid: LoadGrid | null = null,
  rounding: "nearest" | "down" = "nearest",
): number {
  if (loadKg <= 0) return loadable(loadKg, unit);
  // A cap alone has no grid of its own: the equipment's step rounds, the cap only limits.
  const snapping = grid !== null && grid.source !== "cap" ? grid : null;
  const down = rounding === "down";
  let lighter: number;
  if (snapping) {
    const start = alignToGrid(snapping, loadKg);
    const target = start * factor;
    const lowest = snapping.nearest(0);
    if (!down && loadIdentity(start) < loadIdentity(lowest)) {
      lighter = target;
    } else {
      lighter = down ? gridFloor(snapping, target) : snapping.nearest(target);
      if (loadIdentity(lighter) >= loadIdentity(start)) lighter = snapping.below(start) ?? lowest;
      // Deload uses the physical point so display rounding cannot put it below the empty bar.
      if (down) return Math.min(lighter, snapping.capKg ?? lighter);
    }
  } else {
    const step = defaultStep(equipment, unit, loadKg);
    const load = inUnit(loadKg, unit);
    if (down) {
      const floored = Math.floor((load * factor + EPS) / step) * step;
      // Nowhere lower to go on the step: the load stays.
      lighter = floored <= 0 ? loadKg : toKg(Math.min(floored, load), unit);
    } else {
      const rounded = Math.round((load * factor) / step) * step;
      lighter = toKg(rounded >= load && load > step ? load - step : rounded, unit);
    }
  }
  const limit = Math.min(loadKg, grid?.capKg ?? loadKg);
  return weightAtMost(Math.max(0, Math.min(lighter, limit)), unit, limit);
}
