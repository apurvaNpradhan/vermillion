import {
  activeRun,
  insertDeload,
  insertedDeloadsSchema,
  runPausesSchema,
  runPausedAt,
  TRAINING_LIMITS,
} from "@workspace/shared";
import { v7 as uuidv7 } from "uuid";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import {
  assertProgramExists,
  nowIso,
  ownerOf,
  write,
  type TrainingDatabase,
} from "../store-common";
import { programRun } from "../tables";

/** The inserted Deload weeks of a row's JSON text; anything unreadable is none. */
function parseDeloads(text: string | null | undefined): number[] {
  if (text == null) return [];
  try {
    const parsed = insertedDeloadsSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

const runSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  program_id: z.string(),
  activated_at: z.string(),
  started_at: z.string().nullable(),
  finished_at: z.string().nullable(),
  outcome: z.enum(["completed", "stopped"]).nullable(),
  continued_at: z.string().nullable(),
  inserted_deloads: z.string().nullable().optional().transform(parseDeloads),
  pauses: z
    .string()
    .nullish()
    .transform((text) => {
      try {
        return runPausesSchema.safeParse(JSON.parse(text ?? "[]")).data ?? [];
      } catch {
        return [];
      }
    }),
  created_at: z.string(),
});
export async function readRuns(database: Pick<TrainingDatabase, "getAll">) {
  return z
    .array(runSchema)
    .parse(
      await database.getAll(
        "SELECT * FROM program_run ORDER BY activated_at DESC, id DESC LIMIT 500",
      ),
    );
}

export { reconcileRuns } from "../store-common";

export function activateProgram(database: TrainingDatabase, programId: string, scope?: string) {
  return write(database, scope, async (tx, current) => {
    await assertProgramExists(tx, programId);
    if (current?.program_id === programId) return current.id;
    if (current)
      await tx
        .update(programRun)
        .set({ finished_at: nowIso(), outcome: "stopped" })
        .where(eq(programRun.id, current.id));
    const id = uuidv7();
    await tx.insert(programRun).values({
      id,
      user_id: await ownerOf(tx),
      program_id: programId,
      activated_at: nowIso(),
      created_at: nowIso(),
    });
    return id;
  });
}
function endRun(
  database: TrainingDatabase,
  id: string,
  outcome: "stopped" | "completed",
  scope?: string,
) {
  return write(database, scope, async (tx) => {
    await tx
      .update(programRun)
      .set({ finished_at: nowIso(), outcome })
      .where(and(eq(programRun.id, id), isNull(programRun.finished_at)));
  });
}
export const stopProgram = (db: TrainingDatabase, id: string, scope?: string) =>
  endRun(db, id, "stopped", scope);
export const finishRun = (db: TrainingDatabase, id: string, scope?: string) =>
  endRun(db, id, "completed", scope);
/**
 * "Insert deload now": Run week `week` becomes a Deload and restarts the phase pattern. False when the Run is gone or finished, or the week already is an inserted one.
 */
export function insertDeloadNow(
  database: TrainingDatabase,
  id: string,
  week: number,
  scope?: string,
) {
  return write(database, scope, async (tx) => {
    const [run] = await tx.select().from(programRun).where(eq(programRun.id, id)).limit(1);
    if (!run || run.finished_at !== null || runPausedAt(run.pauses ?? [], nowIso())) return false;
    const current = insertedDeloadsSchema.catch([]).parse(run.inserted_deloads ?? []);
    const next = insertDeload(current, week);
    if (next.length === current.length || next.length > TRAINING_LIMITS.insertedDeloadsMax)
      return false;
    await tx.update(programRun).set({ inserted_deloads: next }).where(eq(programRun.id, id));
    return true;
  });
}
export function setRunPaused(
  db: TrainingDatabase,
  id: string,
  paused: boolean,
  scope?: string,
  at = nowIso(),
) {
  return write(db, scope, async (tx, active) => {
    if (active?.id !== id) return false;
    const pauses = active.pauses ?? [];
    if (runPausedAt(pauses, at) === paused) return false;
    const next = paused
      ? [...pauses, { from: at, until: null }]
      : pauses.map((pause) =>
          pause.until === null && Date.parse(pause.from) <= Date.parse(at)
            ? { ...pause, until: at }
            : pause,
        );
    const checked = runPausesSchema.safeParse(next);
    if (!checked.success) return false;
    await tx.update(programRun).set({ pauses: checked.data }).where(eq(programRun.id, id));
    return true;
  });
}

export function keepGoing(database: TrainingDatabase, id: string, scope?: string) {
  return write(database, scope, async (tx) => {
    await tx.update(programRun).set({ continued_at: nowIso() }).where(eq(programRun.id, id));
  });
}
export async function runAgain(
  database: TrainingDatabase,
  id: string,
  programId: string,
  scope?: string,
) {
  return write(database, scope, async (tx) => {
    await assertProgramExists(tx, programId);
    const [previous] = await tx.select().from(programRun).where(eq(programRun.id, id)).limit(1);
    if (!previous || previous.program_id !== programId)
      throw new Error("The Run does not belong to this Program");
    if (previous.finished_at === null)
      await tx
        .update(programRun)
        .set({ finished_at: nowIso(), outcome: "completed" })
        .where(eq(programRun.id, id));
    const next = uuidv7();
    await tx.insert(programRun).values({
      id: next,
      user_id: await ownerOf(tx),
      program_id: programId,
      activated_at: nowIso(),
      created_at: nowIso(),
    });
    return next;
  });
}

export const hasCountedSetSql = `EXISTS (
  SELECT 1 FROM session_exercise e JOIN session_set s ON s.session_exercise_id = e.id
  WHERE e.session_id = training_session.id AND s.completed_at IS NOT NULL AND s.kind <> 'warmup'
)`;

const skipSchema = z.object({
  slotId: z.string(),
  cycle: z.number().int(),
});
const progressSchema = z.object({
  id: z.string(),
  slotId: z.string().nullable(),
  workoutId: z.string().nullable(),
  cycle: z.number().nullable(),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  hasCountedSet: z.coerce.boolean(),
});
const PROGRESS_PAGE_SIZE = 250;

async function readProgressSessions(db: Pick<TrainingDatabase, "getAll">, runId: string) {
  const sessions: z.infer<typeof progressSchema>[] = [];
  let startedAt = "";
  let id = "";
  // Only the latest counted Cycle contributes progress. Slot-less legacy sessions may also
  // lack a cycle, so keep those in chronological order for cycleState to place.
  const counted = `run_id = ? AND finished_at IS NOT NULL AND ${hasCountedSetSql}`;
  while (true) {
    const page = z.array(progressSchema).parse(
      await db.getAll(
        `SELECT id, slot_id AS slotId, workout_id AS workoutId, cycle, started_at AS startedAt,
              finished_at AS finishedAt, 1 AS hasCountedSet
       FROM training_session WHERE ${counted}
         AND (cycle IS NULL OR cycle = (SELECT MAX(cycle) FROM training_session WHERE ${counted}))
         AND (started_at, id) > (?, ?)
       ORDER BY started_at, id LIMIT ${PROGRESS_PAGE_SIZE}`,
        [runId, runId, startedAt, id],
      ),
    );
    sessions.push(...page);
    const last = page.at(-1);
    if (!last || page.length < PROGRESS_PAGE_SIZE) return sessions;
    ({ startedAt, id } = last);
  }
}

export function watchRunState(
  database: TrainingDatabase,
  onValue: (value: {
    runs: z.infer<typeof runSchema>[];
    runId: string | null;
    sessions: z.infer<typeof progressSchema>[];
    phaseStarts: string[];
    /** Slots skipped for a Cycle, for `cycleState`. */
    skips: z.infer<typeof skipSchema>[];
  }) => void,
  onError: () => void,
) {
  let active = true;
  let generation = 0;
  let previous = "";
  const dispose = database.onChangeWithCallback(
    {
      onChange: () => {
        const current = ++generation;
        void database
          .readTransaction(async (tx) => {
            const runs = await readRuns(tx);
            const runId = activeRun(runs)?.id ?? null;
            if (runId === null) return { runs, runId, sessions: [], skips: [], phaseStarts: [] };
            const sessions = await readProgressSessions(tx, runId);
            const skips = z.array(skipSchema).parse(
              await tx.getAll(
                `SELECT slot_id AS slotId, cycle FROM program_slot_skip
             WHERE run_id = ? ORDER BY cycle, slot_id LIMIT ${TRAINING_LIMITS.skipsPerRun}`,
                [runId],
              ),
            );
            const phaseStarts = z
              .array(z.object({ started_at: z.string() }))
              .parse(
                await tx.getAll(
                  `SELECT started_at FROM training_session
                WHERE run_id = ? AND finished_at IS NOT NULL AND ${hasCountedSetSql}
                ORDER BY started_at DESC, id DESC LIMIT 500`,
                  [runId],
                ),
              )
              .map(({ started_at }) => started_at);
            return { runs, runId, sessions, skips, phaseStarts };
          })
          .then((value) => {
            if (!active || current !== generation) return;
            const snapshot = JSON.stringify(value);
            if (snapshot === previous) return;
            previous = snapshot;
            onValue(value);
          })
          .catch(() => {
            if (!active || current !== generation) return;
            previous = "";
            onError();
          });
      },
    },
    {
      tables: [
        "program_run",
        "program_slot_skip",
        "training_session",
        "session_exercise",
        "session_set",
      ],
      throttleMs: 150,
      triggerImmediate: true,
    },
  );
  return () => {
    active = false;
    dispose();
  };
}
