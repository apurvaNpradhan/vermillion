import { TRAINING_LIMITS } from "@workspace/shared";
import { and, eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";

import { nowIso, ownerOf, write, type TrainingDatabase } from "../store-common";
import { programRun, programSlot, programSlotSkip } from "../tables";

// ---- Slot skips ----
// "Skip this cycle": a small synced record that counts a Slot as done for one Cycle of a Run
// (`cycleState`). The Program order never changes. Undo deletes the record.

/**
 * Marks a Workout Slot of the Run's Program as skipped for `cycle`. Idempotent: skipping a Slot
 * that is already skipped for that Cycle changes nothing. Returns the skip's id, or null when the
 * Run or the Slot is gone or is not a Workout Slot of the Run's Program (Rest is never skipped).
 */
export function skipSlot(
  database: TrainingDatabase,
  input: { runId: string; slotId: string; cycle: number },
  expectedInstallId?: string,
): Promise<string | null> {
  return write(database, expectedInstallId, async (tx) => {
    if (
      !Number.isInteger(input.cycle) ||
      input.cycle < 1 ||
      input.cycle > TRAINING_LIMITS.cycleMax
    ) {
      throw new Error("The cycle is out of range");
    }
    const [run] = await tx.select().from(programRun).where(eq(programRun.id, input.runId)).limit(1);
    const [slot] = await tx
      .select()
      .from(programSlot)
      .where(eq(programSlot.id, input.slotId))
      .limit(1);
    if (!run || !slot || slot.program_id !== run.program_id || slot.workout_id === null) {
      return null;
    }
    const [existing] = await tx
      .select({ id: programSlotSkip.id })
      .from(programSlotSkip)
      .where(
        and(
          eq(programSlotSkip.run_id, input.runId),
          eq(programSlotSkip.slot_id, input.slotId),
          eq(programSlotSkip.cycle, input.cycle),
        ),
      )
      .limit(1);
    if (existing) return existing.id;
    const id = uuidv7();
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

/** Undoes a skip. Returns false when the Slot was not skipped for that Cycle. */
export function unskipSlot(
  database: TrainingDatabase,
  input: { runId: string; slotId: string; cycle: number },
  expectedInstallId?: string,
): Promise<boolean> {
  return write(database, expectedInstallId, async (tx) => {
    const removed = await tx
      .delete(programSlotSkip)
      .where(
        and(
          eq(programSlotSkip.run_id, input.runId),
          eq(programSlotSkip.slot_id, input.slotId),
          eq(programSlotSkip.cycle, input.cycle),
        ),
      )
      .returning({ id: programSlotSkip.id });
    return removed.length > 0;
  });
}
