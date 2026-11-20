import { z } from "zod";

import { hasValidSecondaryMuscles } from "./custom-exercise";
import {
  EQUIPMENT,
  EXERCISE_INSTRUCTIONS_MAX,
  EXERCISE_TITLE_MAX,
  EXERCISE_TYPES,
  hasValidDetails,
  MUSCLE_DETAIL_SLUGS,
  MUSCLE_GROUPS,
} from "./vocabulary";

/** Caps of the catalog-only text fields (aliases and search terms are one comma-free line each). */
export const CATALOG_AKA_MAX = 300;
export const CATALOG_SEARCH_TERMS_MAX = 300;
export const CATALOG_RANK_MAX = 32_767;

/**
 * Exercise media the admin uploads to the public bucket. The type and length are signed into the
 * upload URL, so the bucket refuses anything else.
 */
export const EXERCISE_MEDIA_LIMITS = {
  thumbnail: { types: ["image/jpeg", "image/webp"], maxBytes: 500 * 1024 },
  video: { types: ["video/mp4"], maxBytes: 10 * 1024 * 1024 },
} as const;
export const EXERCISE_MEDIA_SLOTS = ["thumbnail", "video"] as const;
export const exerciseMediaSlotSchema = z.enum(EXERCISE_MEDIA_SLOTS);
export type ExerciseMediaSlot = z.infer<typeof exerciseMediaSlotSchema>;

/** Why a file cannot be used for a slot, or null when it can. Clients check before uploading. */
export function exerciseMediaProblem(
  slot: ExerciseMediaSlot,
  file: { type: string; size: number },
): "type" | "size" | "empty" | null {
  const limits = EXERCISE_MEDIA_LIMITS[slot];
  if (!limits.types.some((type) => type === file.type)) return "type";
  if (file.size <= 0) return "empty";
  if (file.size > limits.maxBytes) return "size";
  return null;
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? null : value))
    .nullable();

/** The editable fields of a catalog exercise, as the admin form and the server accept them. */
export const catalogExerciseFields = z.strictObject({
  title: z.string().trim().min(1).max(EXERCISE_TITLE_MAX),
  primaryMuscle: z.enum(MUSCLE_GROUPS),
  secondaryMuscles: z.array(z.enum(MUSCLE_GROUPS)).max(MUSCLE_GROUPS.length),
  primaryDetail: z.array(z.enum(MUSCLE_DETAIL_SLUGS)),
  secondaryDetail: z.array(z.enum(MUSCLE_DETAIL_SLUGS)),
  equipment: z.enum(EQUIPMENT),
  exerciseType: z.enum(EXERCISE_TYPES),
  isFullBodyweight: z.boolean(),
  aka: optionalText(CATALOG_AKA_MAX),
  searchTerms: optionalText(CATALOG_SEARCH_TERMS_MAX),
  instructions: optionalText(EXERCISE_INSTRUCTIONS_MAX),
  rank: z.number().int().min(0).max(CATALOG_RANK_MAX),
});
export type CatalogExerciseFields = z.infer<typeof catalogExerciseFields>;

/** A whole catalog exercise: the secondary muscles rule applies as for Custom exercises. */
export const catalogExerciseInput = catalogExerciseFields
  .extend({
    primaryDetail: catalogExerciseFields.shape.primaryDetail.default([]),
    secondaryDetail: catalogExerciseFields.shape.secondaryDetail.default([]),
  })
  .refine(
    (value) =>
      hasValidSecondaryMuscles({
        primary_muscle: value.primaryMuscle,
        secondary_muscles: value.secondaryMuscles,
      }),
    { path: ["secondaryMuscles"], error: "Secondary muscles must be unique and not the primary" },
  )
  .refine(
    (value) =>
      hasValidDetails({
        primary_muscle: value.primaryMuscle,
        secondary_muscles: value.secondaryMuscles,
        primary_detail: value.primaryDetail,
        secondary_detail: value.secondaryDetail,
      }),
    { path: ["primaryDetail"], error: "Details must belong to the chosen muscle groups" },
  );
