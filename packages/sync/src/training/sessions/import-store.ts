import type { AbstractPowerSyncDatabase } from "@powersync/common";
import {
  canonicalOpsJson,
  checkSyncLimits,
  importContentDigest,
  importDigestSchema,
  SYNC_LIMITS,
  sessionExerciseInput,
  sessionInput,
  sessionStartAllowed,
  type SyncOp,
  type PlannedImportSession,
} from "@workspace/shared";
import { and, eq, gt, inArray } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";

import { keysAfterLast } from "../position";
import { readReceiptInWrite, storeImportReceipt, type ImportReceipt } from "./import-receipt";
import { IMPORT_UNDO_PENDING_SQL, importUndoPending, installIdOf } from "./session-common";
import {
  nowIso,
  ownerOf,
  trainingUploadColumns,
  write,
  type TrainingDatabase,
  type Tx,
} from "../store-common";
import { session, sessionExercise, sessionPhoto, sessionSet } from "../tables";

// 40 rows also fit SQLite builds with a 999-variable statement limit.
const INSERT_CHUNK = 40;
const SAMPLE_ID = "00000000-0000-7000-8000-000000000000";

/** One id for the entire file import, shared by its write batches. */
export const newImportBatchId = (): string => uuidv7();

type ImportWrite = {
  sessions: number;
  sets: number;
  duplicates: number;
  receipt: ImportReceipt | null;
};

function buildRows(
  planned: PlannedImportSession,
  batchId: string,
  userId: string,
  deviceId: string,
  makeId: () => string,
) {
  const created_at = nowIso();
  const exerciseRows: (typeof sessionExercise.$inferInsert)[] = [];
  const setRows: Omit<typeof sessionSet.$inferInsert, "target">[] = [];
  const id = makeId();
  const start = Date.parse(planned.startedAt);
  const durationS = planned.durationS;
  const parsed = sessionInput.parse({
    workout_id: null,
    program_id: null,
    run_id: null,
    slot_id: null,
    gym_id: null,
    phase: null,
    cycle: null,
    title: planned.title,
    title_derived: false,
    note: planned.note,
    started_at: planned.startedAt,
    finished_at: new Date(start + (durationS ?? 0) * 1000).toISOString(),
    duration_s: durationS,
    device_id: deviceId,
    rest_set_id: null,
    rest_started_at: null,
    rest_ends_at: null,
    paused_at: null,
    paused_ms: 0,
  });
  const sessionRow = {
    id,
    user_id: userId,
    import_batch_id: batchId,
    created_at,
    import_fingerprint: importDigestSchema.parse(planned.fingerprint),
    ...parsed,
  };

  const groups = new Map<string, string>();
  const exerciseKeys = keysAfterLast([], planned.exercises.length);
  let ticked = 0;
  for (const [exerciseIndex, entry] of planned.exercises.entries()) {
    const exerciseRowId = makeId();
    let group: string | null = null;
    if (entry.supersetKey !== null) {
      group = groups.get(entry.supersetKey) ?? makeId();
      groups.set(entry.supersetKey, group);
    }
    const exerciseRow = sessionExerciseInput.parse({
      session_id: id,
      exercise_id: entry.exerciseId,
      exercise_title: entry.title,
      exercise_type: entry.type,
      source_workout_exercise_id: null,
      position: exerciseKeys[exerciseIndex] ?? "a0",
      rest_seconds: null,
      note: entry.note,
      superset_group: group,
      log_effort: entry.logEffort,
    });
    exerciseRows.push({
      id: exerciseRowId,
      user_id: userId,
      created_at,
      ...exerciseRow,
    });
    const setKeys = keysAfterLast([], entry.sets.length);
    for (const [setIndex, set] of entry.sets.entries()) {
      setRows.push({
        id: makeId(),
        user_id: userId,
        session_exercise_id: exerciseRowId,
        position: setKeys[setIndex] ?? "a0",
        kind: set.kind,
        weight_kg: set.weightKg,
        reps: set.reps,
        duration_s: set.durationS,
        distance_m: set.distanceM,
        rpe: set.rpe,
        completed_at: new Date(start + Math.min(ticked, durationS ?? 0) * 1000).toISOString(),
        created_at,
      });
      ticked += 1;
    }
  }
  const sessionRows = [
    {
      ...sessionRow,
      import_content: importContentDigest([...exerciseRows, ...setRows].map((row) => row.id)),
    },
  ];
  return { sessionRows, exerciseRows, setRows };
}

type ImportRows = ReturnType<typeof buildRows>;
type ImportTable = "training_session" | "session_exercise" | "session_set";

/** Project the same columns and SQLite boolean values as the connector. Include omitted
 * nullable columns in the estimate so either sparse or full PowerSync PUTs fit. */
function putOps(
  table: ImportTable,
  rows: readonly ImportRows[keyof ImportRows][number][],
): SyncOp[] {
  return rows.map(({ id, ...row }) => {
    const values = new Map<string, string | number | boolean | null | undefined>(
      Object.entries(row),
    );
    const opData = Object.fromEntries(
      [...trainingUploadColumns[table]].map((column) => {
        const value = values.get(column) ?? null;
        return [column, value === true ? 1 : value === false ? 0 : value];
      }),
    );
    return { table, id, op: "PUT", opData };
  });
}

function importOps({ sessionRows, exerciseRows, setRows }: ImportRows) {
  return [
    ...putOps("training_session", sessionRows),
    ...putOps("session_exercise", exerciseRows),
    ...putOps("session_set", setRows),
  ];
}

/**
 * The connector and server accept or reject one SQLite CRUD transaction as a unit.
 * Each workout must therefore fit by itself. Preview refuses oversized workouts, since splitting
 * one would allow a partial workout to reach the server. All generated ids have a fixed width.
 */
export function importSessionCost(planned: PlannedImportSession) {
  const operations = 1 + planned.exercises.reduce((n, entry) => n + 1 + entry.sets.length, 0);
  if (operations > SYNC_LIMITS.maxOps) return null;
  const sized = {
    ...planned,
    exercises: planned.exercises.map((entry) => ({ ...entry, exerciseId: SAMPLE_ID })),
  };
  const ops = importOps(buildRows(sized, SAMPLE_ID, "", SAMPLE_ID, () => SAMPLE_ID));
  if (checkSyncLimits(ops)) return null;
  // Brackets contribute two bytes per transaction. Each additional workout needs a comma.
  return { operations, bytes: new TextEncoder().encode(canonicalOpsJson(ops)).length - 1 };
}

export function* batchImportSessions(sessions: readonly PlannedImportSession[]) {
  let batch: PlannedImportSession[] = [];
  let operations = 0;
  let bytes = 1;
  for (const planned of sessions) {
    const cost = importSessionCost(planned);
    if (!cost) throw new Error("Workout exceeds the sync transaction budget");
    if (
      operations + cost.operations > SYNC_LIMITS.maxOps ||
      bytes + cost.bytes > SYNC_LIMITS.maxTransactionBytes
    ) {
      yield batch;
      batch = [];
      operations = 0;
      bytes = 1;
    }
    batch.push(planned);
    operations += cost.operations;
    bytes += cost.bytes;
  }
  if (batch.length > 0) yield batch;
}

/** Writes whole workouts and updates their account's receipt in the same SQLite transaction. */
export function importSessionBatch(
  database: TrainingDatabase,
  batchId: string,
  sessions: readonly PlannedImportSession[],
  expectedInstallId?: string,
  receipt?: ImportReceipt,
): Promise<ImportWrite> {
  return write(
    database,
    expectedInstallId,
    async (tx) => {
      const userId = await ownerOf(tx);
      const deviceId = await installIdOf(tx);
      const rows: ImportRows = { sessionRows: [], exerciseRows: [], setRows: [] };
      const seen = new Set<string>();
      let duplicates = 0;
      let from = receipt?.from ?? null;
      let to = receipt?.to ?? null;

      for (const planned of sessions) {
        const [known] = await tx
          .select({ id: session.id })
          .from(session)
          .where(
            and(eq(session.user_id, userId), eq(session.import_fingerprint, planned.fingerprint)),
          )
          .limit(1);
        if (known || seen.has(planned.fingerprint)) {
          duplicates += 1;
          continue;
        }
        if (!sessionStartAllowed(planned.startedAt)) {
          throw new Error("A past workout starts within the last 10 years and not in the future");
        }
        seen.add(planned.fingerprint);
        const workout = buildRows(planned, batchId, userId, deviceId, uuidv7);
        rows.sessionRows.push(...workout.sessionRows);
        rows.exerciseRows.push(...workout.exerciseRows);
        rows.setRows.push(...workout.setRows);
        if (from === null || planned.startedAt < from) from = planned.startedAt;
        if (to === null || planned.startedAt > to) to = planned.startedAt;
      }

      if (checkSyncLimits(importOps(rows)))
        throw new Error("Import batch exceeds the sync transaction budget");
      for (let at = 0; at < rows.sessionRows.length; at += INSERT_CHUNK) {
        await tx.insert(session).values(rows.sessionRows.slice(at, at + INSERT_CHUNK));
      }
      for (let at = 0; at < rows.exerciseRows.length; at += INSERT_CHUNK) {
        await tx.insert(sessionExercise).values(rows.exerciseRows.slice(at, at + INSERT_CHUNK));
      }
      for (let at = 0; at < rows.setRows.length; at += INSERT_CHUNK) {
        await tx.insert(sessionSet).values(rows.setRows.slice(at, at + INSERT_CHUNK));
      }

      const counts = { sessions: rows.sessionRows.length, sets: rows.setRows.length, duplicates };
      let saved: ImportReceipt | null = null;
      if (receipt && receipt.batchId === batchId && receipt.sessions + counts.sessions > 0) {
        saved = {
          ...receipt,
          sessions: receipt.sessions + counts.sessions,
          sets: receipt.sets + counts.sets,
          skippedDuplicates: receipt.skippedDuplicates + duplicates,
          from,
          to,
        };
        await storeImportReceipt(tx, userId, saved);
      }
      return { ...counts, receipt: saved };
    },
    { reconcileRuns: false },
  );
}

async function canUndo(tx: Tx, id: string, digest: string | null) {
  if (digest === null) return false;
  const [photo] = await tx
    .select({ id: sessionPhoto.id })
    .from(sessionPhoto)
    .where(eq(sessionPhoto.session_id, id))
    .limit(1);
  if (photo) return false;
  const exercises = await tx
    .select({ id: sessionExercise.id })
    .from(sessionExercise)
    .where(eq(sessionExercise.session_id, id))
    .limit(SYNC_LIMITS.maxOps);
  const sets = await tx
    .select({ id: sessionSet.id })
    .from(sessionSet)
    .innerJoin(sessionExercise, eq(sessionSet.session_exercise_id, sessionExercise.id))
    .where(eq(sessionExercise.session_id, id))
    .limit(SYNC_LIMITS.maxOps);
  return (
    exercises.length + sets.length < SYNC_LIMITS.maxOps &&
    importContentDigest([...exercises, ...sets].map((row) => row.id)) === digest
  );
}

/**
 * One guarded cascade request per Session. The server rechecks the imported child ids under
 * its training lock, then deletes the Session and its descendants. The original rows and
 * receipt stay visible until the stream confirms the deletes.
 */
export function undoImportChunk(
  database: TrainingDatabase,
  batchId: string,
  afterId: string,
  expectedInstallId?: string,
) {
  return write(
    database,
    expectedInstallId,
    async (tx) => {
      const userId = await ownerOf(tx);
      const receipt = await readReceiptInWrite(tx, userId);
      if (receipt?.batchId === batchId && !receipt.undoStarted) {
        await storeImportReceipt(tx, userId, { ...receipt, undoStarted: true });
      }
      const rows = await tx
        .select({
          id: session.id,
          digest: session.import_content,
          pending: importUndoPending,
        })
        .from(session)
        .where(
          and(
            eq(session.user_id, userId),
            eq(session.import_batch_id, batchId),
            gt(session.id, afterId),
          ),
        )
        .orderBy(session.id)
        .limit(SYNC_LIMITS.maxOps);

      const ids = [];
      for (const row of rows) {
        if (!row.pending && (await canUndo(tx, row.id, row.digest))) ids.push(row.id);
      }
      if (ids.length > 0) {
        // A retry gets a fresh marker so an old rejection cannot settle it.
        const request = `${batchId}:${uuidv7()}`;
        const ops = ids.map((id): SyncOp => ({
          id,
          table: "training_session",
          op: "PATCH",
          opData: { import_undo: request },
        }));
        if (checkSyncLimits(ops)) throw new Error("Undo batch exceeds the sync transaction budget");
        await tx.update(session).set({ import_undo: request }).where(inArray(session.id, ids));
      }
      return { cursor: rows.at(-1)?.id ?? null, scanned: rows.length };
    },
    { reconcileRuns: false },
  );
}

/** Reads only source fingerprints, in pages over the indexed start date window. */
export async function readImportFingerprints(
  database: AbstractPowerSyncDatabase,
  window: { from: string; to: string },
): Promise<Set<string>> {
  const known = new Set<string>();
  const page = 1000;
  for (let offset = 0; ; offset += page) {
    const result = await database.getAll(
      `SELECT import_fingerprint FROM training_session
       WHERE import_fingerprint IS NOT NULL AND started_at >= ? AND started_at <= ?
       ORDER BY started_at, id LIMIT ? OFFSET ?`,
      [window.from, window.to, page, offset],
    );
    const rows = z.array(z.object({ import_fingerprint: importDigestSchema })).parse(result);
    for (const row of rows) known.add(row.import_fingerprint);
    if (rows.length < page) return known;
  }
}

export type ImportedSessions = {
  sessions: number;
  pending: number;
  /** A limited list of the workouts still present after an undo request settled. */
  kept: { id: string; title: string; startedAt: string }[];
};

const importedRow = z.object({
  id: z.string().nullable(),
  title: z.string().nullable(),
  startedAt: z.string().nullable(),
  sessions: z.number(),
  pending: z.number(),
  isPending: z.number().nullable(),
});

export function watchImportedSessions(
  database: AbstractPowerSyncDatabase,
  batchId: string,
  onValue: (value: ImportedSessions) => void,
  onError: () => void,
  keptOffset = 0,
) {
  const controller = new AbortController();
  database.watchWithCallback(
    `WITH batch AS (
       SELECT id, title, started_at AS startedAt,
         CASE WHEN ${IMPORT_UNDO_PENDING_SQL} THEN 1 ELSE 0 END AS isPending
       FROM training_session WHERE import_batch_id = ?
     )
     SELECT page.*, totals.sessions, totals.pending
     FROM (SELECT COUNT(*) AS sessions, COALESCE(SUM(isPending), 0) AS pending FROM batch) totals
     LEFT JOIN (
       SELECT * FROM batch ORDER BY isPending, startedAt, id LIMIT ? OFFSET ?
     ) page ON 1 = 1`,
    [batchId, 20, keptOffset],
    {
      onResult: (result) => {
        const parsed = z.array(importedRow).safeParse(result.array);
        if (!parsed.success) return onError();
        const [first] = parsed.data;
        onValue({
          sessions: first?.sessions ?? 0,
          pending: first?.pending ?? 0,
          kept: parsed.data.flatMap(({ id, title, startedAt, isPending }) =>
            id && title !== null && startedAt && !isPending ? [{ id, title, startedAt }] : [],
          ),
        });
      },
      onError,
    },
    { signal: controller.signal, tables: ["training_session", "rejected_writes"] },
  );
  return () => controller.abort();
}
