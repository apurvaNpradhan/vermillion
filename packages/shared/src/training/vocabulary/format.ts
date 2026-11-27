import type { ExerciseType, MuscleGroup } from "../../exercise/vocabulary";
import { MAX_WEIGHT_KG, type WeightUnit } from "./vocabulary";

export const KG_PER_LB = 0.45359237;
const STEP = { kg: 0.25, lb: 0.5 } as const satisfies Record<WeightUnit, number>;

/** Match physical loads at the gram precision used when logging pounds. */
export const loadIdentity = (kg: number): number => Number(kg.toFixed(3));

const roundTo = (value: number, step: number) => Math.round(value / step) * step;

/** Weight in the unit's own step (0.25 kg, 0.5 lb), as short text: "45", "22.5", "42.25". */
export function formatWeight(kg: number, unit: WeightUnit): string {
  const shown = unit === "kg" ? kg : kg / KG_PER_LB;
  return String(Number(roundTo(shown, STEP[unit]).toFixed(2)));
}

/** Whether a set's weight is a load added to the body (belt, vest, dumbbell), written "+20". */
export function addsLoad(type: ExerciseType): boolean {
  return type === "bodyweight_weighted_reps";
}

/** {@link formatWeight}, with a leading plus for a weight added to the body: "+20". */
export function formatLoad(kg: number, unit: WeightUnit, type: ExerciseType): string {
  const text = formatWeight(kg, unit);
  return addsLoad(type) ? `+${text}` : text;
}

/**
 * Typed weight to kilograms, rounded to the unit's step; null when it is not a weight. A pound
 * weight is kept to 3 decimals of a kilogram, so 45 lb shows as 45 lb again.
 */
export function parseWeight(text: string, unit: WeightUnit): number | null {
  const cleaned = text.trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const entered = roundTo(Number(cleaned), STEP[unit]);
  const kg = unit === "kg" ? entered : loadIdentity(entered * KG_PER_LB);
  return kg <= MAX_WEIGHT_KG ? kg : null;
}

/** Round as a typed weight, choosing the greatest unit step at or below the limit when needed. */
export function weightAtMost(kg: number, unit: WeightUnit, limitKg: number): number {
  const rounded = parseWeight(formatWeight(kg, unit), unit);
  if (rounded !== null && rounded <= limitKg) return rounded;
  // A parsed pound weight can round down by half a gram when stored.
  const shownLimit = unit === "kg" ? limitKg : (limitKg + 0.0005) / KG_PER_LB;
  const step = STEP[unit];
  const stepBelow = Math.floor(shownLimit / step) * step;
  const below = parseWeight(String(stepBelow), unit);
  if (below !== null && below <= limitKg) return below;
  return parseWeight(String(Math.max(0, stepBelow - step)), unit) ?? 0;
}

export const DERIVED_TITLE_MUSCLES = 3;

/**
 * The muscle groups a Workout without a title is named after: the three most frequent primary
 * muscles of its exercises (ties go to the one seen first), in first-appearance order.
 */
export function derivedTitleMuscles(primaryMuscles: readonly MuscleGroup[]): MuscleGroup[] {
  const counts = new Map<MuscleGroup, number>();
  for (const muscle of primaryMuscles) counts.set(muscle, (counts.get(muscle) ?? 0) + 1);
  const appearance = [...counts.keys()];
  // `sort` on copies, not `toSorted`: Hermes on the device has no ES2023 array methods.
  const top = [...appearance]
    .sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0))
    .slice(0, DERIVED_TITLE_MUSCLES);
  return top.sort((a, b) => appearance.indexOf(a) - appearance.indexOf(b));
}

/** "Chest · Shoulders · Triceps". `label` gives a muscle group's translated name. */
export function derivedWorkoutTitle(
  primaryMuscles: readonly MuscleGroup[],
  label: (muscle: MuscleGroup) => string,
): string {
  return derivedTitleMuscles(primaryMuscles).map(label).join(" · ");
}
