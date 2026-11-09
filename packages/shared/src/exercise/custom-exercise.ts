import { z } from "zod";

import {
  EQUIPMENT,
  EXERCISE_INSTRUCTIONS_MAX,
  EXERCISE_TITLE_MAX,
  EXERCISE_TYPES,
  MUSCLE_GROUPS,
} from "./vocabulary";

/** The writable fields of a Custom exercise, without the cross-field rule (patches use this). */
export const customExerciseFields = z.strictObject({
  title: z.string().trim().min(1).max(EXERCISE_TITLE_MAX),
  primary_muscle: z.enum(MUSCLE_GROUPS),
  secondary_muscles: z.array(z.enum(MUSCLE_GROUPS)),
  equipment: z.enum(EQUIPMENT),
  exercise_type: z.enum(EXERCISE_TYPES),
  is_full_bodyweight: z.boolean(),
  instructions: z.string().max(EXERCISE_INSTRUCTIONS_MAX).nullable(),
});

type SecondaryRule = { primary_muscle: string; secondary_muscles: readonly string[] };

/** Secondary muscles are unique and never include the primary one. */
export function hasValidSecondaryMuscles(value: SecondaryRule): boolean {
  return (
    new Set(value.secondary_muscles).size === value.secondary_muscles.length &&
    !value.secondary_muscles.includes(value.primary_muscle)
  );
}

/** A whole Custom exercise as a form or the server accepts it. */
export const customExerciseInput = customExerciseFields.refine(hasValidSecondaryMuscles, {
  path: ["secondary_muscles"],
  error: "Secondary muscles must be unique and not include the primary muscle",
});
export type CustomExerciseInput = z.infer<typeof customExerciseInput>;
