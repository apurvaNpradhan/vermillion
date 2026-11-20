// The review page's decisions, as the lead pulls them from its store into a scratch file.
import { z } from "zod";

import {
  EQUIPMENT,
  EXERCISE_TYPES,
  MUSCLE_DETAIL_SLUGS,
  MUSCLE_GROUPS,
} from "../../../packages/shared/src/exercise/vocabulary.ts";

export const TABS = ["backfill", "candidates", "ranks"] as const;

const edits = z.strictObject({
  title: z.string().min(1).optional(),
  primary_muscle: z.enum(MUSCLE_GROUPS).optional(),
  secondary_muscles: z.array(z.enum(MUSCLE_GROUPS)).optional(),
  primary_detail: z.array(z.enum(MUSCLE_DETAIL_SLUGS)).optional(),
  secondary_detail: z.array(z.enum(MUSCLE_DETAIL_SLUGS)).optional(),
  equipment: z.enum(EQUIPMENT).optional(),
  exercise_type: z.enum(EXERCISE_TYPES).optional(),
  tier: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).optional(),
});
export type Edits = z.infer<typeof edits>;

export const decisionSchema = z.strictObject({
  tab: z.enum(TABS),
  /** The proposal's id: a backfill item id, a candidate id or a rank item id. */
  id: z.string().min(1),
  decision: z.enum(["approve", "reject"]),
  edits: edits.optional(),
});
export type Decision = z.infer<typeof decisionSchema>;

export const decisionsFileSchema = z.array(decisionSchema);
