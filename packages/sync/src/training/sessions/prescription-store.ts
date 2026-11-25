import {
  undoPrescriptionAdjustment,
  prescriptionFor,
  prescriptionSchema,
  type Prescription,
  type PrescriptionDraft,
} from "@workspace/shared";
import { and, eq, isNull } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { write, type TrainingDatabase, type Tx } from "../store-common";
import { sessionExercise, sessionSet } from "../tables";
import { installIdOf, requireSession, type SessionExerciseRow } from "./session-common";

/** The first capture on this install wins. The server applies the same rule across installs. */
export function capturePrescription(
  db: TrainingDatabase,
  entryId: string,
  draft: PrescriptionDraft,
  writeScope?: string,
) {
  return write(db, writeScope, async (tx) => {
    const [entry] = await tx.select().from(sessionExercise).where(eq(sessionExercise.id, entryId));
    return entry ? capturePrescriptionIn(tx, entry, draft) : null;
  });
}

export async function capturePrescriptionIn(
  tx: Tx,
  entry: SessionExerciseRow,
  draft: PrescriptionDraft,
) {
  if (entry.exercise_id !== draft.exerciseId) return null;
  const current = prescriptionFor(entry.prescription, entry.exercise_id);
  if (current) return current;
  const session = await requireSession(tx, entry.session_id);
  if (session.finished_at !== null || session.device_id !== (await installIdOf(tx))) return null;
  const snapshot = prescriptionSchema.parse({
    ...draft,
    revision: uuidv7(),
    previousRevision: null,
  });
  await tx
    .update(sessionExercise)
    .set({ prescription: snapshot })
    .where(eq(sessionExercise.id, entry.id));
  return snapshot;
}

export async function untickedIdsIn(tx: Tx, entryId: string) {
  const rows = await tx
    .select({ id: sessionSet.id })
    .from(sessionSet)
    .where(and(eq(sessionSet.session_exercise_id, entryId), isNull(sessionSet.completed_at)));
  return new Set(rows.map(({ id }) => id));
}

export async function revisePrescriptionIn(tx: Tx, entryId: string, snapshot: Prescription) {
  const prescription = prescriptionSchema.parse({
    ...snapshot,
    revision: uuidv7(),
    previousRevision: snapshot.revision,
  });
  await tx.update(sessionExercise).set({ prescription }).where(eq(sessionExercise.id, entryId));
}

export function undoSessionAdjustment(db: TrainingDatabase, entryId: string, writeScope?: string) {
  return write(db, writeScope, async (tx) => {
    const [entry] = await tx.select().from(sessionExercise).where(eq(sessionExercise.id, entryId));
    if (!entry) return false;
    const session = await requireSession(tx, entry.session_id);
    if (session.finished_at !== null || session.device_id !== (await installIdOf(tx))) return false;
    const snapshot = prescriptionFor(entry.prescription, entry.exercise_id);
    if (!snapshot?.adjustment) return false;
    const restored = undoPrescriptionAdjustment(snapshot, await untickedIdsIn(tx, entryId));
    if (!restored) return false;
    await revisePrescriptionIn(tx, entryId, restored);
    return true;
  });
}
