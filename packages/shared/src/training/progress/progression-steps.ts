import type { Equipment } from "../../exercise/vocabulary";
import { KG_PER_LB, formatWeight, parseWeight } from "../vocabulary/format";
import type { WeightUnit } from "../vocabulary/vocabulary";

/**
 * The smallest load change that equipment can make, in the display unit: a barbell with the
 * smallest plates adds 2.5 kg (5 lb) a side pair, a dumbbell rack steps by 1 kg (2.5 lb), a
 * kettlebell by 2 kg (5 lb). Plates held in the hand step like a barbell. Everything else (machines,
 * bands, suspension, no equipment) has fine adjustment, so 1 kg (2.5 lb).
 */
const SMALLEST_STEP = {
  barbell: { kg: 2.5, lb: 5 },
  plate: { kg: 2.5, lb: 5 },
  kettlebell: { kg: 2, lb: 5 },
  dumbbell: { kg: 1, lb: 2.5 },
  machine: { kg: 1, lb: 2.5 },
  resistance_band: { kg: 1, lb: 2.5 },
  suspension: { kg: 1, lb: 2.5 },
  none: { kg: 1, lb: 2.5 },
  other: { kg: 1, lb: 2.5 },
} as const satisfies Record<Equipment, Record<WeightUnit, number>>;

/** An automatic increment is this share of the set's load, before rounding to a step. */
const INCREMENT_SHARE = 0.025;

const inUnit = (kg: number, unit: WeightUnit) => (unit === "kg" ? kg : kg / KG_PER_LB);
const toKg = (value: number, unit: WeightUnit) => (unit === "kg" ? value : value * KG_PER_LB);

/** A weight as typing it would store it, so a suggestion ticked as a Ghost matches a typed one. */
export const loadable = (kg: number, unit: WeightUnit) =>
  parseWeight(formatWeight(kg, unit), unit) ?? kg;

/**
 * The increment for a set at `loadKg`, in kilograms: a manual setting always wins; otherwise
 * about 2.5% of the load, rounded to the nearest loadable step of the equipment in the user's
 * unit and never below the smallest step.
 */
export function incrementFor(
  loadKg: number | null,
  equipment: Equipment,
  settings: { weightUnit: WeightUnit; weightIncrementKg: number | null },
): number {
  if (settings.weightIncrementKg !== null) return settings.weightIncrementKg;
  const unit = settings.weightUnit;
  const step = SMALLEST_STEP[equipment][unit];
  const raw = inUnit(loadKg ?? 0, unit) * INCREMENT_SHARE;
  return toKg(Math.max(step, Math.round(raw / step) * step), unit);
}

/**
 * `factor` of a load (0.9 for 90%), rounded to the equipment's step and always below the load when
 * the load is more than one step, so a light lift still gets lighter. Zero stays zero.
 */
export function lightenLoad(
  loadKg: number,
  factor: number,
  equipment: Equipment,
  unit: WeightUnit,
): number {
  if (loadKg <= 0) return loadable(loadKg, unit);
  const step = SMALLEST_STEP[equipment][unit];
  const load = inUnit(loadKg, unit);
  let lighter = Math.round((load * factor) / step) * step;
  if (lighter >= load && load > step) lighter = load - step;
  return loadable(toKg(Math.max(lighter, 0), unit), unit);
}
