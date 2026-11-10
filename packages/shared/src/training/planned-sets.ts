import { z } from "zod";

import { SET_FIELDS, type ExerciseType, type SetField } from "../exercise/vocabulary";
import {
  EFFORT_STEPS,
  MAX_WEIGHT_KG,
  SET_KINDS,
  TRAINING_LIMITS,
  type EffortStep,
} from "./vocabulary";

const effortStep = z
  .number()
  .refine((value): value is EffortStep => EFFORT_STEPS.some((step) => step === value), {
    error: "Effort is 6 to 10 in halves",
  });
const reps = z.number().int().min(1).max(999);

/**
 * One Planned set, whatever the exercise type. Unknown keys are refused; an absent key is an
 * empty target. {@link plannedSetsSchema} then refuses the fields a type does not record.
 */
export const plannedSetSchema = z
  .strictObject({
    kind: z.enum(SET_KINDS),
    reps_min: reps.optional(),
    reps_max: reps.optional(),
    weight_kg: z.number().min(0).max(MAX_WEIGHT_KG).optional(),
    effort_min: effortStep.optional(),
    effort_max: effortStep.optional(),
    duration_s: z.number().int().min(1).max(86_400).optional(),
    distance_m: z.number().min(0).max(1_000_000).optional(),
    floors: z.number().int().min(1).max(10_000).optional(),
    steps: z.number().int().min(1).max(1_000_000).optional(),
  })
  .superRefine((set, ctx) => {
    // A range has both ends or neither, and the minimum never passes the maximum.
    const ranges = [
      ["reps_min", "reps_max"],
      ["effort_min", "effort_max"],
    ] as const;
    for (const [low, high] of ranges) {
      const [min, max] = [set[low], set[high]];
      if ((min === undefined) !== (max === undefined)) {
        ctx.addIssue({
          code: "custom",
          path: [min === undefined ? low : high],
          error: "Both ends",
        });
      } else if (min !== undefined && max !== undefined && min > max) {
        ctx.addIssue({ code: "custom", path: [low], error: "Minimum is above maximum" });
      }
    }
  });
export type PlannedSet = z.infer<typeof plannedSetSchema>;

const FIELD_KEYS = {
  weight: ["weight_kg"],
  reps: ["reps_min", "reps_max", "effort_min", "effort_max"],
  duration: ["duration_s"],
  distance: ["distance_m"],
  floors: ["floors"],
  steps: ["steps"],
} as const satisfies Record<SetField, readonly (keyof PlannedSet)[]>;

/** The keys of a Planned set that an exercise type records (`kind` is always allowed). */
export function plannedSetKeys(exerciseType: ExerciseType): readonly (keyof PlannedSet)[] {
  return SET_FIELDS[exerciseType].flatMap((field) => FIELD_KEYS[field]);
}

const schemas = new Map<ExerciseType, ReturnType<typeof build>>();

function build(exerciseType: ExerciseType) {
  const allowed: ReadonlySet<string> = new Set(plannedSetKeys(exerciseType));
  return z
    .array(plannedSetSchema)
    .max(TRAINING_LIMITS.setsPerExercise)
    .superRefine((sets, ctx) => {
      for (const [index, set] of sets.entries()) {
        for (const [key, value] of Object.entries(set)) {
          if (key !== "kind" && value !== undefined && !allowed.has(key)) {
            ctx.addIssue({
              code: "custom",
              path: [index, key],
              error: `${exerciseType} does not record ${key}`,
            });
          }
        }
      }
    });
}

/** The Planned sets of one Workout exercise: at most 20, only the fields its type records. */
export function plannedSetsSchema(exerciseType: ExerciseType) {
  const existing = schemas.get(exerciseType);
  if (existing) return existing;
  const created = build(exerciseType);
  schemas.set(exerciseType, created);
  return created;
}

/** 3 working sets: 8-12 reps for reps types, 30 s for duration types, other fields empty. */
export function defaultPlannedSets(exerciseType: ExerciseType): PlannedSet[] {
  const fields: readonly SetField[] = SET_FIELDS[exerciseType];
  const target: Omit<PlannedSet, "kind"> = fields.includes("reps")
    ? { reps_min: 8, reps_max: 12 }
    : fields.includes("duration")
      ? { duration_s: 30 }
      : {};
  return [1, 2, 3].map(() => ({ kind: "working", ...target }));
}
