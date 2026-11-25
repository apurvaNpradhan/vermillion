import { prescriptionFor, prescriptionSchema, type PrescriptionDraft } from "@workspace/shared";
import { eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { write, type TrainingDatabase, type Tx } from "../store-common";
import { sessionExercise } from "../tables";
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
