import type { DbExecutor } from "@workspace/db";
import {
  deloadLogged,
  insertedDeloadsSchema,
  PHASE_WEEK_MAX,
  runPausesSchema,
  timezoneSchema,
  TRAINING_LIMITS,
  type RunPause,
  type SessionInput,
} from "@workspace/shared";
import { and, eq, exists, isNotNull, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import { SyncRejection, type SyncTableHandler } from "../platform/sync/handler";
import { liveProgram, lockUserTraining } from "./operations/lookup";
import { accept, idOf, jsonText, newRowId, now } from "./sync-common";
import { programRun, programSlot, session, sessionExercise, sessionSet } from "./tables";

const fields = {
  program_id: z.uuid(),
  activated_at: z.iso.datetime({ offset: true }),
  started_at: z.iso.datetime({ offset: true }).nullable(),
  finished_at: z.iso.datetime({ offset: true }).nullable(),
  outcome: z.enum(["completed", "stopped"]).nullable(),
  continued_at: z.iso.datetime({ offset: true }).nullable(),
  // JSON text of the Run weeks turned into Deload weeks; absent from an older app's write.
  inserted_deloads: jsonText(insertedDeloadsSchema).nullable(),
  pauses: jsonText(runPausesSchema).nullable(),
};
// A write fills what it leaves out; a PATCH must not (zod applies defaults to `.partial()` too).
const input = z.strictObject({
  ...fields,
  started_at: fields.started_at.default(null),
  finished_at: fields.finished_at.default(null),
  outcome: fields.outcome.default(null),
  continued_at: fields.continued_at.default(null),
  inserted_deloads: fields.inserted_deloads.default(null),
  pauses: fields.pauses.default(null),
});
// The weeks stay text here: `input` parses them once, after the patch is merged onto the row.
const patchInput = z
  .strictObject({
    ...fields,
    inserted_deloads: z.string().nullable(),
    pauses: z.string().nullable(),
    deload_change: z.string().optional(),
  })
  .partial();
const deloadWeek = z.int().min(1).max(PHASE_WEEK_MAX);
const deloadChange = jsonText(
  z.discriminatedUnion("action", [
    z.strictObject({ action: z.literal("insert"), week: deloadWeek }),
    z.strictObject({ action: z.literal("undo"), week: deloadWeek, timezone: timezoneSchema }),
  ]),
);

/** Legacy snapshots can add weeks, except weeks already taken back by an explicit undo. */
function mergeLegacyWeeks(
  stored: readonly number[] | null,
  incoming: readonly number[] | null,
  undone: readonly number[],
) {
  if (incoming === null && stored === null) return null;
  const added = (incoming ?? []).filter((week) => !undone.includes(week));
  return [...new Set([...(stored ?? []), ...added])].sort((a, b) => a - b);
}

/**
 * An undo is refused once a counted Session was started as the Deload in that Run week. A Build
 * Session logged earlier in the week does not count: it was not the Deload. The rule is the shared
 * one; the query only hands it the Deload Sessions, and the check runs on the stored rows, so
 * it gives the same answer whichever device's write arrives first.
 */
async function assertNoCountedSession(
  db: DbExecutor,
  run: typeof programRun.$inferSelect,
  week: number,
  timezone: string,
) {
  const starts = await db
    .select({ at: session.startedAt })
    .from(session)
    .where(
      and(
        eq(session.runId, run.id),
        eq(session.userId, run.userId),
        eq(session.phase, "deload"),
        isNull(session.deletedAt),
        isNotNull(session.finishedAt),
        exists(
          db
            .select({ id: sessionSet.id })
            .from(sessionExercise)
            .innerJoin(sessionSet, eq(sessionSet.sessionExerciseId, sessionExercise.id))
            .where(
              and(
                eq(sessionExercise.sessionId, session.id),
                isNull(sessionExercise.deletedAt),
                isNull(sessionSet.deletedAt),
                isNotNull(sessionSet.completedAt),
                ne(sessionSet.kind, "warmup"),
              ),
            ),
        ),
      ),
    );
  const sessions = starts.map(({ at }) => ({
    started_at: at.toISOString(),
    phase: "deload" as const,
  }));
  if (
    deloadLogged(
      { started_at: run.startedAt?.toISOString() ?? null, pauses: run.pauses ?? [] },
      week,
      timezone,
      sessions,
    )
  )
    throw new SyncRejection("RUN_DELOAD_LOGGED");
}

/** Offline pauses merge by start time. A stale open copy cannot reopen a resumed interval. */
function mergePauses(stored: readonly RunPause[] | null, incoming: readonly RunPause[] | null) {
  if (stored === null && incoming === null) return null;
  const pauses = new Map<number, RunPause>();
  for (const pause of [...(stored ?? []), ...(incoming ?? [])]) {
    const start = Date.parse(pause.from);
    const existing = pauses.get(start);
    if (
      !existing ||
      existing.until === null ||
      (pause.until !== null && Date.parse(pause.until) < Date.parse(existing.until))
    )
      pauses.set(start, pause);
  }
  return accept(
    runPausesSchema.safeParse(
      [...pauses.values()].sort((a, b) => Date.parse(a.from) - Date.parse(b.from)),
    ),
  );
}

const date = (value: string | null) => (value === null ? null : new Date(value));
/** The earlier of two instants; a null is "none", so the other one wins. */
const earlier = (stored: Date | null, incoming: Date | null) =>
  stored && incoming ? (incoming < stored ? incoming : stored) : (stored ?? incoming);
export const runSyncHandler: SyncTableHandler = {
  table: "program_run",
  async apply(db, userId, op) {
    await lockUserTraining(db, userId);
    const id = idOf(op.id);
    const [row] = await db.select().from(programRun).where(eq(programRun.id, id)).limit(1);
    if (row && row.userId !== userId) throw new SyncRejection("RUN_NOT_FOUND");
    if (op.op === "DELETE") throw new SyncRejection("SYNC_INVALID_OP");
    if (op.op === "PATCH" && !row) throw new SyncRejection("RUN_NOT_FOUND");
    const { deload_change: changeText, ...patch } = accept(patchInput.safeParse(op.opData ?? {}));
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
              pauses: row.pauses === null ? null : JSON.stringify(row.pauses),
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
    let undoneDeloads = row?.undoneDeloads ?? null;
    let insertedDeloads = mergeLegacyWeeks(
      row?.insertedDeloads ?? null,
      values.inserted_deloads,
      undoneDeloads ?? [],
    );
    if (changeText !== undefined) {
      if (!row || op.op !== "PATCH" || Object.keys(patch).length > 0)
        throw new SyncRejection("SYNC_INVALID_OP");
      const change = accept(deloadChange.safeParse(changeText));
      const weeks = row.insertedDeloads ?? [];
      if (change.action === "undo") {
        if (!weeks.includes(change.week)) return;
        await assertNoCountedSession(db, row, change.week, change.timezone);
        insertedDeloads = weeks.filter((week) => week !== change.week);
        undoneDeloads = [...new Set([...(undoneDeloads ?? []), change.week])];
      } else {
        insertedDeloads = [...new Set([...weeks, change.week])].sort((a, b) => a - b);
        undoneDeloads = undoneDeloads?.filter((week) => week !== change.week) ?? null;
      }
    }
    if ((insertedDeloads?.length ?? 0) > TRAINING_LIMITS.insertedDeloadsMax)
      throw new SyncRejection("SYNC_INVALID_OP");
    const columns = {
      programId: values.program_id,
      activatedAt: new Date(values.activated_at),
      // Only ever earlier: a device that logged a Session later must not move the Run's start (and
      // every Run week) forward, and a null never clears a stored start.
      startedAt: earlier(row?.startedAt ?? null, date(values.started_at)),
      finishedAt: date(values.finished_at),
      outcome: values.outcome,
      continuedAt: date(values.continued_at),
      insertedDeloads,
      undoneDeloads,
      pauses: mergePauses(row?.pauses ?? null, values.pauses),
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
