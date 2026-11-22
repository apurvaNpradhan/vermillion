import { formatWeight, type WeightUnit } from "@workspace/shared";

/** What a set that beat the record logged, as far as the plain message needs it. */
export interface RecordSet {
  weightKg?: number | null | undefined;
  reps?: number | null | undefined;
}

/**
 * What the record toast says: "Bench press personal record: 102.5 kg × 5" when the set has a
 * weight and reps, the reps alone, or just the exercise.
 */
export type RecordMessage =
  | { kind: "weight-reps"; exercise: string; weight: string; unit: WeightUnit; reps: number }
  | { kind: "reps"; exercise: string; reps: number }
  | { kind: "plain"; exercise: string };

export function recordMessage(exercise: string, set: RecordSet, unit: WeightUnit): RecordMessage {
  const { weightKg, reps } = set;
  if (weightKg != null && reps != null) {
    return { kind: "weight-reps", exercise, weight: formatWeight(weightKg, unit), unit, reps };
  }
  if (reps != null) return { kind: "reps", exercise, reps };
  return { kind: "plain", exercise };
}
