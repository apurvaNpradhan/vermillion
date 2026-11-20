// The three proposal files `propose-expansion.ts` writes and `build-patches.ts` reads back.
import { z } from "zod";

import {
  EQUIPMENT,
  EXERCISE_TYPES,
  MUSCLE_DETAIL_SLUGS,
  MUSCLE_GROUPS,
} from "../../../packages/shared/src/exercise/vocabulary.ts";

const groups = z.array(z.enum(MUSCLE_GROUPS));
const details = z.array(z.enum(MUSCLE_DETAIL_SLUGS));
const tier = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]);

const backfillBase = {
  /** Unique within the file: the row id, plus `#equipment` or `#primary` for those proposals. */
  id: z.string().min(1),
  row_id: z.string().min(1),
  title: z.string(),
  thumbnail_key: z.string().nullable(),
  /** The earlier dataset's title for the matched row; null when nothing matched. */
  source_title: z.string().nullable(),
  current_primary_muscle: z.enum(MUSCLE_GROUPS),
  current_secondary_muscles: groups,
  current_equipment: z.enum(EQUIPMENT),
  /** Details removed as noise (for example a rotator cuff on a press). */
  dropped: details,
  flags: z.array(z.string()),
};

export const backfillItemSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    ...backfillBase,
    kind: z.literal("details"),
    primary_detail: details,
    secondary_detail: details,
  }),
  z.strictObject({ ...backfillBase, kind: z.literal("equipment"), equipment: z.enum(EQUIPMENT) }),
  z.strictObject({
    ...backfillBase,
    kind: z.literal("primary"),
    primary_muscle: z.enum(MUSCLE_GROUPS),
    secondary_muscles: groups,
    primary_detail: details,
    secondary_detail: details,
  }),
]);
export type BackfillItem = z.infer<typeof backfillItemSchema>;
export const backfillFileSchema = z.array(backfillItemSchema);

export const candidateSchema = z.strictObject({
  /** The earlier dataset's id, kept. */
  id: z.string().min(1),
  source_title: z.string(),
  title: z.string().min(1),
  aka: z.string().nullable(),
  primary_muscle: z.enum(MUSCLE_GROUPS),
  secondary_muscles: groups,
  primary_detail: details,
  secondary_detail: details,
  equipment: z.enum(EQUIPMENT),
  exercise_type: z.enum(EXERCISE_TYPES),
  is_full_bodyweight: z.boolean(),
  /** The heuristic rank tier (the Ranks tab holds the decision). */
  tier,
  source_video_key: z.string(),
  source_image_key: z.string().nullable(),
  dropped: details,
  flags: z.array(z.string()),
});
export type Candidate = z.infer<typeof candidateSchema>;
export const candidatesFileSchema = z.array(candidateSchema);

export const rankItemSchema = z.strictObject({
  id: z.string().min(1),
  source: z.enum(["catalog", "candidate"]),
  title: z.string(),
  /** The heuristic tier. */
  tier,
  /** The rank value proposed: the tier's, or the existing non-zero rank where they disagree. */
  rank: z.number().int().min(0),
  current_rank: z.number().int().min(0),
  flags: z.array(z.string()),
});
export type RankItem = z.infer<typeof rankItemSchema>;
export const ranksFileSchema = z.array(rankItemSchema);
