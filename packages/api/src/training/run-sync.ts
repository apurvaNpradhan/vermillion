import type { DbExecutor } from "@workspace/db";
import { insertedDeloadsSchema, type SessionInput } from "@workspace/shared";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { SyncRejection, type SyncTableHandler } from "../platform/sync/handler";
import { liveProgram, lockUserTraining } from "./operations/lookup";
import { accept, idOf, jsonText, newRowId, now } from "./sync-common";
import { programRun, programSlot } from "./tables";

const fields = {
  program_id: z.uuid(),
  activated_at: z.iso.datetime({ offset: true }),
  started_at: z.iso.datetime({ offset: true }).nullable(),
  finished_at: z.iso.datetime({ offset: true }).nullable(),
  outcome: z.enum(["completed", "stopped"]).nullable(),
  continued_at: z.iso.datetime({ offset: true }).nullable(),
  // JSON text of the Run weeks turned into Deload weeks; absent from an older app's write.
  inserted_deloads: jsonText(insertedDeloadsSchema).nullable(),
};
// A write fills what it leaves out; a PATCH must not (zod applies defaults to `.partial()` too).
const input = z.strictObject({
  ...fields,
  started_at: fields.started_at.default(null),
  finished_at: fields.finished_at.default(null),
  outcome: fields.outcome.default(null),
  continued_at: fields.continued_at.default(null),
  inserted_deloads: fields.inserted_deloads.default(null),
});
// The weeks stay text here: `input` parses them once, after the patch is merged onto the row.
const patchInput = z.strictObject({ ...fields, inserted_deloads: z.string().nullable() }).partial();
/** Two devices may each insert a Deload while offline: both stay, and the weeks do not repeat. */
const unionWeeks = (stored: readonly number[] | null, incoming: readonly number[] | null) =>
  incoming === null && stored === null
    ? null
    : [...new Set([...(stored ?? []), ...(incoming ?? [])])].sort((a, b) => a - b);
const date = (value: string | null) => (value === null ? null : new Date(value));
export const runSyncHandler: SyncTableHandler = {
  table: "program_run",
  async apply(db, userId, op) {
    await lockUserTraining(db, userId);
    const id = idOf(op.id);
    const [row] = await db.select().from(programRun).where(eq(programRun.id, id)).limit(1);
    if (row && row.userId !== userId) throw new SyncRejection("RUN_NOT_FOUND");
    if (op.op === "DELETE") throw new SyncRejection("SYNC_INVALID_OP");
    if (op.op === "PATCH" && !row) throw new SyncRejection("RUN_NOT_FOUND");
    const patch = accept(patchInput.safeParse(op.opData ?? {}));
    const values = accept(
      input.safeParse({
        ...(row
          ? {
              program_id: row.programId,
              activated_at: row.activatedAt.toISOString(),
              started_at: row.startedAt?.toISOString() ?? null,
              finished_at: row.finishedAt?.toISOString() ?? null,
              outcome: row.outcome,
              continued_at: row.continuedAt?.toISOString() ?? null,
              inserted_deloads:
                row.insertedDeloads === null ? null : JSON.stringify(row.insertedDeloads),
            }
          : {}),
        ...patch,
      }),
    );
    if (!row && !(await liveProgram(db, userId, values.program_id)))
      throw new SyncRejection("RUN_PROGRAM_NOT_FOUND");
    if (
      row &&
      (row.programId !== values.program_id ||
        row.activatedAt.getTime() !== Date.parse(values.activated_at))
    )
      throw new SyncRejection("SYNC_INVALID_OP");
    if ((values.finished_at === null) !== (values.outcome === null))
      throw new SyncRejection("SYNC_INVALID_OP");
    const columns = {
      programId: values.program_id,
      activatedAt: new Date(values.activated_at),
      startedAt: date(values.started_at),
      finishedAt: date(values.finished_at),
      outcome: values.outcome,
      continuedAt: date(values.continued_at),
      insertedDeloads: unionWeeks(row?.insertedDeloads ?? null, values.inserted_deloads),
    };
    if (!row) {
      accept(newRowId.safeParse(id));
      await db.insert(programRun).values({ id, userId, ...columns });
    } else
      await db
        .update(programRun)
        .set({ ...columns, updatedAt: now() })
        .where(eq(programRun.id, id));
  },
  purgeTombstones: async () => 0,
};

/** Plain references preserve history, but may never point into another owner's plan. */
export async function checkSessionRun(db: DbExecutor, userId: string, values: SessionInput) {
  if (values.run_id !== null) {
    const [run] = await db
      .select()
      .from(programRun)
      .where(eq(programRun.id, values.run_id))
      .limit(1);
    if (!run || run.userId !== userId || run.programId !== values.program_id)
      throw new SyncRejection("RUN_NOT_FOUND");
  }
  if (values.slot_id !== null) {
    const [slot] = await db
      .select()
      .from(programSlot)
      .where(eq(programSlot.id, values.slot_id))
      .limit(1);
    if (!slot || slot.userId !== userId || slot.programId !== values.program_id)
      throw new SyncRejection("RUN_SLOT_PROGRAM_MISMATCH");
  }
}
