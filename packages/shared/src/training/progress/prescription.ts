import { z } from "zod";
import { actualValuesSchema } from "../logging/session-inputs";
import type { PlannedSet } from "../plans/planned-sets";
import { MAX_WEIGHT_KG, SESSION_LIMITS, type SetKind } from "../vocabulary/vocabulary";
import { evidenceSchema } from "./evidence";
import { PROGRESSION_REASONS, type SetOutcome } from "./progression";

const load = z.number().min(0).max(MAX_WEIGHT_KG);
const reason = z.enum(PROGRESSION_REASONS);
const outcome = z.strictObject({
  reason,
  changeKg: load.optional(),
  capKg: load.optional(),
  limit: z.enum(["plates", "equipment"]).optional(),
  loadFactor: z.number().nonnegative().optional(),
  share: z.number().min(0).max(1).optional(),
  ceiling: z.int().min(1).max(999).optional(),
  changeS: z.number().min(0).max(86_400).optional(),
  changeM: z.number().min(0).max(1_000_000).optional(),
}) satisfies z.ZodType<SetOutcome>;

const ghostFields = {
  weight: actualValuesSchema.shape.weight_kg.optional(),
  reps: actualValuesSchema.shape.reps.optional(),
  rpe: actualValuesSchema.shape.rpe.optional(),
  duration: actualValuesSchema.shape.duration_s.optional(),
  distance: actualValuesSchema.shape.distance_m.optional(),
  floors: actualValuesSchema.shape.floors.optional(),
  steps: actualValuesSchema.shape.steps.optional(),
};

export const prescribedSetSchema = z.strictObject({
  id: z.uuid(),
  ghosts: z.strictObject(ghostFields),
  outcome: outcome.nullable(),
  unadjustedWeightKg: load.optional(),
  /** What the target was when this was suggested ({@link setBasis}); a later edit makes it stale. */
  basis: z.string().max(16).optional(),
});
export type PrescribedSet = z.infer<typeof prescribedSetSchema>;

/**
 * One same-day adjustment: the set that missed (or beat) its target, why, and each unticked set it
 * moved with the load that set had before. Adjustments stack, so they undo one at a time.
 */
export const adjustmentSchema = z.strictObject({
  setId: z.uuid(),
  reason: z.enum(["reps_short", "reps_over", "effort_high", "effort_low"]),
  reps: z.int().min(0).max(999),
  moved: z
    .array(z.strictObject({ id: z.uuid(), fromKg: load }))
    .max(SESSION_LIMITS.setsPerExercise),
});
export type Adjustment = z.infer<typeof adjustmentSchema>;

export const prescriptionSchema = z
  .strictObject({
    exerciseId: z.uuid(),
    revision: z.uuid(),
    previousRevision: z.uuid().nullable(),
    reason: reason.nullable(),
    incrementKg: z.number().nonnegative(),
    breakDays: z.int().nonnegative().nullable(),
    capKg: load.nullable(),
    /** What the numbers rest on; absent in a snapshot made before it was kept. */
    evidence: evidenceSchema.optional(),
    /** The Session gym the numbers were made for; absent in a snapshot that did not record it. */
    gymId: z.uuid().nullable().optional(),
    sets: z.array(prescribedSetSchema).max(SESSION_LIMITS.setsPerExercise),
    adjustments: z.array(adjustmentSchema).max(SESSION_LIMITS.setsPerExercise).optional(),
    /** The lifter pressed Undo: the exercise adjusts no more in this Session. */
    adjustmentUndone: z.boolean().optional(),
  })
  .refine(({ sets }) => new Set(sets.map(({ id }) => id)).size === sets.length);
export type Prescription = z.infer<typeof prescriptionSchema>;
export type PrescriptionDraft = Omit<
  z.input<typeof prescriptionSchema>,
  "revision" | "previousRevision" | "adjustments" | "adjustmentUndone"
>;

const readOutcome = outcome.nullable().catch(null);

/**
 * How a build reads a snapshot it may not have written: unknown keys are dropped, a reason it does
 * not know reads as none, and an outcome or adjustment it cannot read is left out. A snapshot
 * without a valid identity or sets does not parse at all. This is for showing; only a snapshot the
 * strict {@link prescriptionSchema} accepts is ever revised or written back.
 */
export const prescriptionReadSchema = z
  .object({
    exerciseId: z.uuid(),
    revision: z.uuid(),
    previousRevision: z.uuid().nullable().catch(null),
    reason: reason.nullable().catch(null),
    incrementKg: z.number().nonnegative().catch(0),
    breakDays: z.int().nonnegative().nullable().catch(null),
    capKg: load.nullable().catch(null),
    evidence: evidenceSchema.optional().catch(undefined),
    gymId: z.uuid().nullable().optional().catch(undefined),
    sets: z
      .array(
        z.object({
          id: z.uuid(),
          ghosts: z.object(ghostFields),
          outcome: readOutcome,
          unadjustedWeightKg: load.optional().catch(undefined),
          basis: z.string().max(16).optional().catch(undefined),
        }),
      )
      .max(SESSION_LIMITS.setsPerExercise),
    adjustments: z
      .array(adjustmentSchema)
      .max(SESSION_LIMITS.setsPerExercise)
      .optional()
      .catch(undefined),
    adjustmentUndone: z.boolean().optional().catch(undefined),
  })
  .refine(({ sets }) => new Set(sets.map(({ id }) => id)).size === sets.length);

export function prescriptionFor(prescription: Prescription | null | undefined, exerciseId: string) {
  return prescription?.exerciseId === exerciseId ? prescription : null;
}

/** The newest adjustment still in effect: what the note under the exercise says. */
export function latestAdjustment(snapshot: Prescription | null | undefined): Adjustment | null {
  return snapshot?.adjustments?.at(-1) ?? null;
}

/**
 * Identifies what a set's target was when its suggestion was made, so a later edit of the kind or
 * target can be told from history that merely moved on. A short FNV-1a hash of the sorted target.
 */
export function setBasis(kind: SetKind, target: PlannedSet | null | undefined): string {
  const fields = Object.entries(target ?? {})
    .filter(([key, value]) => key !== "kind" && value !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : 1));
  const text = JSON.stringify([kind, fields]);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash = Math.imul(hash ^ text.charCodeAt(index), 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/** What the exercise's sets are now, for comparing with a snapshot. */
export type CurrentSet = { id: string; basis: string; completed: boolean };

/**
 * Which unticked sets of a snapshot need a fresh suggestion, or null when it still stands. A set
 * whose kind or target changed since it was suggested is replaced, and every unticked set is when
 * the Session gym moved. A new cap replaces suggestions above it, including loads Undo could
 * restore. Newly added sets are appended by the revision itself.
 */
export function staleSets(
  snapshot: Prescription,
  current: readonly CurrentSet[],
  gymId: string | null,
  capKg: number | null = snapshot.capKg,
): ReadonlySet<string> | null {
  const saved = new Map(snapshot.sets.map((set) => [set.id, set]));
  const moved = snapshot.gymId !== undefined && snapshot.gymId !== gymId;
  const capChanged = snapshot.capKg !== capKg && current.some((set) => !set.completed);
  const overCap = (kg: number | null | undefined) => capKg !== null && kg != null && kg > capKg;
  const previouslyOverCap = new Set(
    snapshot.adjustments?.flatMap(({ moved }) =>
      moved.filter(({ fromKg }) => overCap(fromKg)).map(({ id }) => id),
    ),
  );
  const replace = new Set<string>();
  let missing = false;
  for (const set of current) {
    const known = saved.get(set.id);
    if (!known) missing = true;
    else if (
      !set.completed &&
      (moved ||
        (known.basis !== undefined && known.basis !== set.basis) ||
        overCap(known.ghosts.weight) ||
        overCap(known.unadjustedWeightKg) ||
        previouslyOverCap.has(set.id))
    )
      replace.add(set.id);
  }
  return replace.size > 0 || moved || missing || capChanged ? replace : null;
}

/**
 * The snapshot with a fresh suggestion for the sets named in `replace` and for sets it did not
 * cover, taken from `draft`; every other set keeps what it had (ticked sets always do) and sets
 * that are gone leave. A replaced set's adjustment is forgotten, and an adjustment left with
 * nothing it moved or whose trigger is gone goes with it. Reason and step follow the draft when
 * a set was replaced. The cap always follows the draft. The caller supplies the new `revision` and `previousRevision`.
 */
export function revisedSets(
  saved: Prescription,
  draft: PrescriptionDraft,
  replace: ReadonlySet<string>,
): Omit<Prescription, "revision" | "previousRevision"> {
  const known = new Map(saved.sets.map((set) => [set.id, set]));
  const sets = draft.sets.map((fresh) => {
    const kept = known.get(fresh.id);
    return kept && !replace.has(fresh.id) ? kept : prescribedSetSchema.parse(fresh);
  });
  const present = new Set(sets.map(({ id }) => id));
  const adjustments = (saved.adjustments ?? []).flatMap((adjustment) => {
    const moved = adjustment.moved.filter(({ id }) => present.has(id) && !replace.has(id));
    return present.has(adjustment.setId) && moved.length > 0 ? [{ ...adjustment, moved }] : [];
  });
  const header = replace.size > 0 ? draft : saved;
  return {
    exerciseId: saved.exerciseId,
    reason: header.reason ?? null,
    incrementKg: header.incrementKg,
    breakDays: header.breakDays ?? null,
    capKg: draft.capKg ?? null,
    ...(header.evidence ? { evidence: header.evidence } : {}),
    gymId: draft.gymId ?? saved.gymId ?? null,
    sets,
    ...(adjustments.length > 0 ? { adjustments } : {}),
    ...(saved.adjustmentUndone ? { adjustmentUndone: true } : {}),
  };
}
