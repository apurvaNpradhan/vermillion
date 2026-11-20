// The current catalog seed, reduced to the fields the proposal and patch scripts read.
import { z } from "zod";

import {
  EQUIPMENT,
  EXERCISE_TYPES,
  MUSCLE_DETAIL_SLUGS,
  MUSCLE_GROUPS,
} from "../../../packages/shared/src/exercise/vocabulary.ts";

const seedRow = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  primary_muscle: z.enum(MUSCLE_GROUPS),
  secondary_muscles: z.array(z.enum(MUSCLE_GROUPS)),
  primary_detail: z.array(z.enum(MUSCLE_DETAIL_SLUGS)).default([]),
  secondary_detail: z.array(z.enum(MUSCLE_DETAIL_SLUGS)).default([]),
  equipment: z.enum(EQUIPMENT),
  exercise_type: z.enum(EXERCISE_TYPES),
  rank: z.number().int().min(0),
  video_key: z.string().nullable(),
  thumbnail_key: z.string().nullable(),
});
export type SeedRow = z.infer<typeof seedRow>;

export function parseSeed(text: string): SeedRow[] {
  let json: ReturnType<typeof JSON.parse>;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("catalog seed is not valid JSON");
  }
  return z.array(seedRow).min(1).parse(json);
}
