import { slotSkipId, TRAINING_LIMITS, type RunSlot } from "@workspace/shared";
import { eq } from "drizzle-orm";

import { nowIso, ownerOf, write, type TrainingDatabase, type Tx } from "../store-common";
import { programSlot, programSlotSkip } from "../tables";

/** Marks a live Workout Slot of the active Run as skipped. */
export function skipSlot(
  database: TrainingDatabase,
  input: RunSlot,
  expectedInstallId?: string,
): Promise<string | null> {
  return write(database, expectedInstallId, async (tx, run) => {
    if (
      !Number.isInteger(input.cycle) ||
      input.cycle < 1 ||
      input.cycle > TRAINING_LIMITS.cycleMax
    ) {
      throw new Error("The cycle is out of range");
    }
    if (!run || run.id !== input.runId || run.outcome !== null) return null;
    const [slot] = await tx
      .select()
      .from(programSlot)
      .where(eq(programSlot.id, input.slotId))
      .limit(1);
    if (!slot || slot.program_id !== run.program_id || slot.workout_id === null) return null;
    const id = slotSkipId(input);
    const [existing] = await tx
      .select({ id: programSlotSkip.id })
      .from(programSlotSkip)
      .where(eq(programSlotSkip.id, id))
      .limit(1);
    if (existing) return id;
    await tx.insert(programSlotSkip).values({
      id,
      user_id: await ownerOf(tx),
      run_id: input.runId,
      slot_id: input.slotId,
      cycle: input.cycle,
      created_at: nowIso(),
    });
    return id;
  });
}

/** Undo stays scoped to the original Run, even after the Run ends. */
export function unskipSlot(
  database: TrainingDatabase,
  input: RunSlot,
  expectedInstallId?: string,
): Promise<boolean> {
  return write(database, expectedInstallId, (tx) => unskipSlotIn(tx, input), {
    reconcileRuns: false,
  });
}

export async function unskipSlotIn(tx: Tx, input: RunSlot): Promise<boolean> {
  const removed = await tx
    .delete(programSlotSkip)
    .where(eq(programSlotSkip.id, slotSkipId(input)))
    .returning({ id: programSlotSkip.id });
  return removed.length > 0;
}
