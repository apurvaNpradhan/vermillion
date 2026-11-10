import { v7 as uuidv7 } from "uuid";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import {
  reconcileRuns,
  assertProgramExists,
  nowIso,
  ownerOf,
  write,
  type TrainingDatabase,
} from "./store-common";
import { programRun } from "./tables";

const runSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  program_id: z.string(),
  activated_at: z.string(),
  started_at: z.string().nullable(),
  finished_at: z.string().nullable(),
  outcome: z.enum(["completed", "stopped"]).nullable(),
  continued_at: z.string().nullable(),
  created_at: z.string(),
});
export async function readRuns(database: TrainingDatabase) {
  return z
    .array(runSchema)
    .parse(
      await database.getAll(
        "SELECT * FROM program_run ORDER BY activated_at DESC, id DESC LIMIT 500",
      ),
    );
}

export { reconcileRuns } from "./store-common";

export function activateProgram(database: TrainingDatabase, programId: string, scope?: string) {
  return write(database, scope, async (tx) => {
    await assertProgramExists(tx, programId);
    const current = await reconcileRuns(tx);
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
    await reconcileRuns(tx);
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
export function keepGoing(database: TrainingDatabase, id: string, scope?: string) {
  return write(database, scope, async (tx) => {
    await reconcileRuns(tx);
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
    await reconcileRuns(tx);
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

const progressSchema = z.object({
  id: z.string(),
  runId: z.string().nullable(),
  workoutId: z.string().nullable(),
  cycle: z.number().nullable(),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
});
export function watchRunState(
  database: TrainingDatabase,
  onValue: (value: {
    runs: z.infer<typeof runSchema>[];
    sessions: z.infer<typeof progressSchema>[];
  }) => void,
  onError: () => void,
) {
  const controller = new AbortController();
  database.watchWithCallback(
    "SELECT r.id, s.id FROM program_run r LEFT JOIN training_session s ON s.run_id = r.id LIMIT 10000",
    [],
    {
      onResult: () => {
        void Promise.all([
          readRuns(database),
          database.getAll(
            "SELECT id, run_id AS runId, workout_id AS workoutId, cycle, started_at AS startedAt, finished_at AS finishedAt FROM training_session WHERE run_id IS NOT NULL ORDER BY started_at, id LIMIT 10000",
          ),
        ])
          .then(([runs, sessions]) => {
            if (!controller.signal.aborted)
              onValue({ runs, sessions: z.array(progressSchema).parse(sessions) });
          })
          .catch(onError);
      },
      onError,
    },
    { signal: controller.signal, tables: ["program_run", "training_session"], throttleMs: 150 },
  );
  return () => controller.abort();
}
