import {
  adjustPrescription,
  progresses,
  prescriptionSchema,
  revertPrescriptionAdjustment,
  revisedSets,
  undoPrescriptionAdjustment,
  type AdjustmentLoads,
  type Prescription,
  type PrescriptionDraft,
  type SetKind,
} from "@workspace/shared";
import { eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import { write, type TrainingDatabase, type Tx } from "../store-common";
import { sessionExercise, sessionSet } from "../tables";
import { installIdOf, requireSession, type SessionExerciseRow } from "./session-common";

/**
 * The snapshot of an entry as this build can write it back. Null without one, for another
 * exercise's (left behind by a swap), and for one this build does not fully understand (a newer
 * build wrote keys or reasons it does not know): such a snapshot is neither used to override
 * suggestions, nor adjusted, nor revised.
 */
export function readSnapshot(
  entry: Pick<SessionExerciseRow, "prescription" | "exercise_id">,
): Prescription | null {
  if (entry.prescription == null) return null;
  const parsed = prescriptionSchema.safeParse(entry.prescription);
  return parsed.success && parsed.data.exerciseId === entry.exercise_id ? parsed.data : null;
}

const named = z.object({ exerciseId: z.string() });

/** A snapshot that stands in the way of a capture: anything that is not another exercise's. */
function blocksCapture(entry: SessionExerciseRow): boolean {
  if (entry.prescription == null) return false;
  const peek = named.safeParse(entry.prescription);
  return !peek.success || peek.data.exerciseId === entry.exercise_id;
}

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
  // Whatever is there stays, even what this build cannot read: it is never written over.
  if (blocksCapture(entry)) return readSnapshot(entry);
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

/** The sets of one entry: their kinds and whether each is ticked. */
export async function setsOfEntryIn(tx: Tx, entryId: string) {
  const rows = await tx
    .select({ id: sessionSet.id, kind: sessionSet.kind, completed_at: sessionSet.completed_at })
    .from(sessionSet)
    .where(eq(sessionSet.session_exercise_id, entryId));
  return new Map(
    rows.map((row) => [row.id, { kind: row.kind, completed: row.completed_at !== null }]),
  );
}

/** The sets of an entry that are still unticked, with their kinds. */
export async function untickedIn(tx: Tx, entryId: string): Promise<Map<string, SetKind>> {
  const sets = await setsOfEntryIn(tx, entryId);
  return new Map(
    [...sets].flatMap(([id, set]) => (set.completed ? [] : [[id, set.kind] as const])),
  );
}

/** `content` as the next snapshot of the one it is based on, or null if it is not a valid one. */
export function nextRevision(
  content: Omit<Prescription, "revision" | "previousRevision">,
  basedOn: string,
): Prescription | null {
  const parsed = prescriptionSchema.safeParse({
    ...content,
    revision: uuidv7(),
    previousRevision: basedOn,
  });
  return parsed.success ? parsed.data : null;
}

/** Writes `content` as the entry's next snapshot, naming the one it replaces. */
export async function revisePrescriptionIn(
  tx: Tx,
  entryId: string,
  content: Omit<Prescription, "revision" | "previousRevision">,
  basedOn: string,
): Promise<boolean> {
  const prescription = nextRevision(content, basedOn);
  if (!prescription) return false;
  await tx.update(sessionExercise).set({ prescription }).where(eq(sessionExercise.id, entryId));
  return true;
}

/** Whether this device may change the entry's Session: it is running and this install owns it. */
async function ownsActiveSession(tx: Tx, entry: SessionExerciseRow) {
  const session = await requireSession(tx, entry.session_id);
  return session.finished_at === null && session.device_id === (await installIdOf(tx))
    ? session
    : null;
}

/** What a ticked set was logged at, for judging it against its target. */
export type LoggedValues = {
  id: string;
  kind: SetKind;
  weight_kg?: number | null;
  reps?: number | null;
  rpe?: number | null;
};

/**
 * After a progressing set was ticked (or corrected while ticked): adjusts the unticked sets of the
 * entry by what it says, in one revision. A trigger's earlier adjustment is taken back first when
 * `revert` is set. Nothing happens for a snapshot this build cannot write, a Session this install
 * does not run, or without the loads to snap to.
 */
export async function adjustAfterSetIn(
  tx: Tx,
  entry: SessionExerciseRow,
  set: LoggedValues,
  loads: AdjustmentLoads | undefined,
  revert = false,
) {
  if (!loads && !revert) return;
  const snapshot = readSnapshot(entry);
  if (!snapshot) return;
  const session = await ownsActiveSession(tx, entry);
  if (!session) return;
  const unticked = await untickedIn(tx, entry.id);
  let current = snapshot;
  let changed = false;
  if (revert) {
    const reverted = revertPrescriptionAdjustment(current, set.id, new Set(unticked.keys()));
    if (reverted) {
      current = reverted;
      changed = true;
    }
  }
  if (loads && progresses(set.kind)) {
    const next = adjustPrescription(
      current,
      set.id,
      set,
      unticked,
      loads,
      session.phase !== "deload" && session.phase !== "test" && !entry.stall_deload,
    );
    if (next) {
      current = next;
      changed = true;
    }
  }
  if (changed) await revisePrescriptionIn(tx, entry.id, current, snapshot.revision);
}

/** A ticked set was unticked: what it moved on the sets after it no longer follows from it. */
export async function revertAfterUntickIn(tx: Tx, entry: SessionExerciseRow, setId: string) {
  const snapshot = readSnapshot(entry);
  if (!snapshot?.adjustments?.some((adjustment) => adjustment.setId === setId)) return;
  if (!(await ownsActiveSession(tx, entry))) return;
  const reverted = revertPrescriptionAdjustment(
    snapshot,
    setId,
    new Set((await untickedIn(tx, entry.id)).keys()),
  );
  if (reverted) await revisePrescriptionIn(tx, entry.id, reverted, snapshot.revision);
}

/**
 * Gives the unticked sets named in `replace`, and any set the snapshot never covered, a fresh
 * suggestion from `draft`, for a Session gym that changed, a target or kind that was edited, or a
 * set that was added. Ticked sets, and unticked sets not named, keep what they were suggested.
 * False when there is nothing to revise or this build cannot write the snapshot.
 */
export function revisePrescription(
  db: TrainingDatabase,
  entryId: string,
  draft: PrescriptionDraft,
  replace: readonly string[],
  writeScope?: string,
) {
  return write(db, writeScope, async (tx) => {
    const [entry] = await tx.select().from(sessionExercise).where(eq(sessionExercise.id, entryId));
    if (!entry || entry.exercise_id !== draft.exerciseId) return false;
    const saved = readSnapshot(entry);
    if (!saved || !(await ownsActiveSession(tx, entry))) return false;
    const sets = await setsOfEntryIn(tx, entryId);
    const unticked = new Set([...sets].flatMap(([id, set]) => (set.completed ? [] : [id])));
    const present = { ...draft, sets: draft.sets.filter(({ id }) => sets.has(id)) };
    const content = revisedSets(saved, present, new Set(replace.filter((id) => unticked.has(id))));
    return revisePrescriptionIn(tx, entryId, content, saved.revision);
  });
}

export function undoSessionAdjustment(db: TrainingDatabase, entryId: string, writeScope?: string) {
  return write(db, writeScope, async (tx) => {
    const [entry] = await tx.select().from(sessionExercise).where(eq(sessionExercise.id, entryId));
    if (!entry || !(await ownsActiveSession(tx, entry))) return false;
    const snapshot = readSnapshot(entry);
    if (!snapshot?.adjustments?.length) return false;
    const restored = undoPrescriptionAdjustment(
      snapshot,
      new Set((await untickedIn(tx, entryId)).keys()),
    );
    return restored ? revisePrescriptionIn(tx, entryId, restored, snapshot.revision) : false;
  });
}
