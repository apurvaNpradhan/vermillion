import { z } from "zod";

import {
  EQUIPMENT,
  EXERCISE_INSTRUCTIONS_MAX,
  EXERCISE_TITLE_MAX,
  EXERCISE_TYPES,
  hasValidDetails,
  MUSCLE_DETAIL_SLUGS,
  MUSCLE_GROUPS,
} from "./vocabulary";

/** The writable fields of a Custom exercise, without the cross-field rule (patches use this). */
export const customExerciseFields = z.strictObject({
  title: z.string().trim().min(1).max(EXERCISE_TITLE_MAX),
  primary_muscle: z.enum(MUSCLE_GROUPS),
  secondary_muscles: z.array(z.enum(MUSCLE_GROUPS)),
  primary_detail: z.array(z.enum(MUSCLE_DETAIL_SLUGS)),
  secondary_detail: z.array(z.enum(MUSCLE_DETAIL_SLUGS)),
  equipment: z.enum(EQUIPMENT),
  exercise_type: z.enum(EXERCISE_TYPES),
  is_full_bodyweight: z.boolean(),
  image_media_id: z.uuid().nullable().optional(),
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
export const customExerciseInput = customExerciseFields
  .extend({
    primary_detail: customExerciseFields.shape.primary_detail.default([]),
    secondary_detail: customExerciseFields.shape.secondary_detail.default([]),
  })
  .refine(hasValidSecondaryMuscles, {
    path: ["secondary_muscles"],
    error: "Secondary muscles must be unique and not include the primary muscle",
  })
  .refine(hasValidDetails, {
    path: ["primary_detail"],
    error: "Details must belong to the chosen muscle groups",
  });
export type CustomExerciseInput = z.infer<typeof customExerciseInput>;
