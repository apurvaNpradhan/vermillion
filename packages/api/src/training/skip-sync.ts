import { TRAINING_LIMITS } from "@workspace/shared";
import { and, count, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { SyncRejection, type SyncTableHandler } from "../platform/sync/handler";
import { lockUserTraining } from "./operations/lookup";
import { accept, assertRoom, idOf, invalid, newRowId, now } from "./sync-common";
import { programRun, programSlot, programSlotSkip } from "./tables";

const fields = z.strictObject({
  run_id: z.uuid(),
  slot_id: z.uuid(),
  cycle: z.number().int().min(1).max(TRAINING_LIMITS.cycleMax),
});
// A skip never changes: undoing one deletes it and skipping again makes a new row.

/**
 * Upload handler of `program_slot_skip` (ADR 0036): one row per Slot of a Run left out of a
 * Cycle. The Run and the Slot must be the writer's, and the Slot a Workout Slot of the Run's
 * Program (Rest is never marked, so never skipped). A second live skip for the same Slot and
 * Cycle, made on another device, is applied as nothing. DELETE is the soft delete of Undo.
 */
export const programSlotSkipSyncHandler: SyncTableHandler = {
  table: "program_slot_skip",
  async apply(db, userId, op) {
    const id = idOf(op.id);
    await lockUserTraining(db, userId);
    const [row] = await db
      .select()
      .from(programSlotSkip)
      .where(eq(programSlotSkip.id, id))
      .limit(1);
    if (row && row.userId !== userId) throw new SyncRejection("SYNC_ROW_NOT_FOUND");

    if (op.op === "DELETE") {
      if (!row) throw new SyncRejection("SYNC_ROW_NOT_FOUND");
      if (row.deletedAt === null) {
        await db
          .update(programSlotSkip)
          .set({ deletedAt: now(), updatedAt: now() })
          .where(eq(programSlotSkip.id, id));
      }
      return;
    }
    // Skips are immutable: only a PUT, and a repeat of the stored values.
    if (op.op !== "PUT") return invalid();
    const values = accept(fields.safeParse(op.opData ?? {}));
    if (row) {
      if (
        row.runId !== values.run_id ||
        row.slotId !== values.slot_id ||
        row.cycle !== values.cycle
      ) {
        return invalid();
      }
      // Delete wins: a stale repeat of a deleted skip is refused, never brought back.
      if (row.deletedAt !== null) throw new SyncRejection("SYNC_ROW_DELETED");
      return;
    }

    const [run] = await db
      .select()
      .from(programRun)
      .where(eq(programRun.id, values.run_id))
      .limit(1);
    if (!run || run.userId !== userId || run.deletedAt !== null) {
      throw new SyncRejection("RUN_NOT_FOUND");
    }
    const [slot] = await db
      .select()
      .from(programSlot)
      .where(eq(programSlot.id, values.slot_id))
      .limit(1);
    if (!slot || slot.userId !== userId || slot.programId !== run.programId) {
      throw new SyncRejection("RUN_SLOT_PROGRAM_MISMATCH");
    }
    if (slot.workoutId === null) return invalid();

    const [existing] = await db
      .select({ id: programSlotSkip.id })
      .from(programSlotSkip)
      .where(
        and(
          eq(programSlotSkip.runId, values.run_id),
          eq(programSlotSkip.slotId, values.slot_id),
          eq(programSlotSkip.cycle, values.cycle),
          isNull(programSlotSkip.deletedAt),
        ),
      )
      .limit(1);
    if (existing && existing.id !== id) return;
    const [live] = await db
      .select({ n: count() })
      .from(programSlotSkip)
      .where(and(eq(programSlotSkip.runId, values.run_id), isNull(programSlotSkip.deletedAt)));
    assertRoom(live?.n ?? 0, 1, TRAINING_LIMITS.skipsPerRun);

    accept(newRowId.safeParse(id));
    await db.insert(programSlotSkip).values({
      id,
      userId,
      runId: values.run_id,
      slotId: values.slot_id,
      cycle: values.cycle,
    });
  },
  // Rows are tiny; the minimal row stays as the deleted-id marker, like the other training tables.
  purgeTombstones: async () => 0,
};
