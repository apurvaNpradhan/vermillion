import { z } from "zod";

import { MAX_WEIGHT_KG, SESSION_LIMITS, SET_KINDS } from "../vocabulary/vocabulary";

const load = z.number().min(0).max(MAX_WEIGHT_KG);

/**
 * What a suggestion rests on, so a lifter can check the engine's work: the Session it read, the
 * factor that scaled every load, and where the grid or a cap moved a load. Compact, because it is
 * kept in the Session's prescription snapshot.
 */
export const evidenceSchema = z.strictObject({
  /** The baseline Session: when it was and the progressing sets it compared. Null for none. */
  baseline: z
    .strictObject({
      id: z.string().max(64).optional(),
      at: z.string().max(40),
      sets: z
        .array(
          z.strictObject({
            kind: z.enum(SET_KINDS),
            weightKg: load.nullable(),
            reps: z.int().min(0).max(999).nullable(),
            /** Timed and carried work: the time held and the distance covered, when it had any. */
            durationS: z.number().min(0).max(86_400).optional(),
            distanceM: z.number().min(0).max(1_000_000).optional(),
          }),
        )
        .max(SESSION_LIMITS.setsPerExercise),
    })
    .nullable(),
  /** Why every load was scaled: a break (with its days) or a Deload (phase, stall or Lighter week). */
  factor: z
    .strictObject({
      source: z.enum(["break", "deload"]),
      share: z.number().min(0).max(1),
      days: z.int().nonnegative().optional(),
    })
    .optional(),
  /** A load the grid or a cap moved: the load asked for, and the one the gym can make. */
  snapped: z.strictObject({ source: z.enum(["grid", "cap"]), fromKg: load, toKg: load }).optional(),
});
export type Evidence = z.infer<typeof evidenceSchema>;
