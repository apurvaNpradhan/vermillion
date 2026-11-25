import { z } from "zod";
import { actualValuesSchema } from "../logging/session-inputs";
import { MAX_WEIGHT_KG, SESSION_LIMITS } from "../vocabulary/vocabulary";
import { PROGRESSION_REASONS, type SetOutcome } from "./progression";

const load = z.number().min(0).max(MAX_WEIGHT_KG);
const reason = z.enum(PROGRESSION_REASONS);
const outcome = z.strictObject({
  reason,
  changeKg: load.optional(),
  capKg: load.optional(),
  limit: z.enum(["plates", "equipment"]).optional(),
  loadFactor: z.number().nonnegative().optional(),
}) satisfies z.ZodType<SetOutcome>;

export const prescribedSetSchema = z.strictObject({
  id: z.uuid(),
  ghosts: z.strictObject({
    weight: actualValuesSchema.shape.weight_kg.optional(),
    reps: actualValuesSchema.shape.reps.optional(),
    rpe: actualValuesSchema.shape.rpe.optional(),
    duration: actualValuesSchema.shape.duration_s.optional(),
    distance: actualValuesSchema.shape.distance_m.optional(),
    floors: actualValuesSchema.shape.floors.optional(),
    steps: actualValuesSchema.shape.steps.optional(),
  }),
  outcome: outcome.nullable(),
});
export type PrescribedSet = z.infer<typeof prescribedSetSchema>;

export const prescriptionSchema = z
  .strictObject({
    exerciseId: z.uuid(),
    revision: z.uuid(),
    previousRevision: z.uuid().nullable(),
    reason: reason.nullable(),
    incrementKg: z.number().nonnegative(),
    breakDays: z.int().nonnegative().nullable(),
    capKg: load.nullable(),
    sets: z.array(prescribedSetSchema).max(SESSION_LIMITS.setsPerExercise),
  })
  .refine(({ sets }) => new Set(sets.map(({ id }) => id)).size === sets.length);
export type Prescription = z.infer<typeof prescriptionSchema>;
export type PrescriptionDraft = Omit<
  z.input<typeof prescriptionSchema>,
  "revision" | "previousRevision"
>;

export function prescriptionFor(prescription: Prescription | null | undefined, exerciseId: string) {
  return prescription?.exerciseId === exerciseId ? prescription : null;
}
