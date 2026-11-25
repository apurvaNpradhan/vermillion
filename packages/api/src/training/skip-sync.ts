import { slotSkipId, TRAINING_LIMITS } from "@workspace/shared";
import { and, count, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { SyncRejection, type SyncTableHandler } from "../platform/sync/handler";
import { lockUserTraining } from "./operations/lookup";
import { accept, assertRoom, idOf, invalid, now } from "./sync-common";
import { programRun, programSlot, programSlotSkip } from "./tables";

const fields = z.strictObject({
  run_id: z.uuid(),
  slot_id: z.uuid(),
  cycle: z.number().int().min(1).max(TRAINING_LIMITS.cycleMax),
});

/** PUT and Undo share the same id across devices. Re-skipping revives the tombstone. */
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
      if (row?.deletedAt === null) {
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
    if (id !== slotSkipId({ runId: values.run_id, slotId: values.slot_id, cycle: values.cycle })) {
      return invalid();
    }
    if (row?.deletedAt === null) return;

    const [run] = await db
      .select()
      .from(programRun)
      .where(eq(programRun.id, values.run_id))
      .limit(1);
    if (
      !run ||
      run.userId !== userId ||
      run.deletedAt !== null ||
      run.finishedAt !== null ||
      run.outcome !== null
    ) {
      throw new SyncRejection("RUN_NOT_FOUND");
    }
    const [slot] = await db
      .select()
      .from(programSlot)
      .where(eq(programSlot.id, values.slot_id))
      .limit(1);
    if (
      !slot ||
      slot.userId !== userId ||
      slot.programId !== run.programId ||
      slot.deletedAt !== null
    ) {
      throw new SyncRejection("RUN_SLOT_PROGRAM_MISMATCH");
    }
    if (slot.workoutId === null) return invalid();

    const [live] = await db
      .select({ n: count() })
      .from(programSlotSkip)
      .where(and(eq(programSlotSkip.runId, values.run_id), isNull(programSlotSkip.deletedAt)));
    assertRoom(live?.n ?? 0, 1, TRAINING_LIMITS.skipsPerRun);

    await db
      .insert(programSlotSkip)
      .values({
        id,
        userId,
        runId: values.run_id,
        slotId: values.slot_id,
        cycle: values.cycle,
      })
      .onConflictDoUpdate({
        target: programSlotSkip.id,
        set: { deletedAt: null, updatedAt: now() },
      });
  },
  // Rows are tiny; the minimal row stays as the deleted-id marker, like the other training tables.
  purgeTombstones: async () => 0,
};
