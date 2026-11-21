import type { AbstractPowerSyncDatabase } from "@powersync/common";
import {
  sessionExerciseInput,
  sessionInput,
  sessionStartAllowed,
  type KnownSession,
  type PlannedImportSession,
} from "@workspace/shared";
import { and, eq, inArray } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";

import { keysAfterLast } from "../position";
import { installIdOf } from "./session-common";
import { nowIso, ownerOf, write, type TrainingDatabase } from "../store-common";
import { session, sessionExercise, sessionSet } from "../tables";

/** Rows per INSERT, so a statement stays well under SQLite's variable limit. */
const INSERT_CHUNK = 200;

/** A fresh id for one import, kept on each of its Sessions so Undo import finds them. */
export const newImportBatchId = (): string => uuidv7();

export type ImportWrite = { sessions: number; sets: number };

/**
 * Writes finished Sessions from a history import, each with its exercises and sets, in one write
 * transaction: a failure leaves no half of a Session. They carry no Workout, Program or run, so
 * the rotation never moves for them, and they count like any finished Session in History,
 * records and charts. Their sets are ticked; their times are the file's. The caller sends
 * Sessions in small batches and has already left out those outside the 10-year window.
 */
export function importSessionBatch(
  database: TrainingDatabase,
  batchId: string,
  sessions: readonly PlannedImportSession[],
  expectedInstallId?: string,
): Promise<ImportWrite> {
  return write(database, expectedInstallId, async (tx) => {
    const userId = await ownerOf(tx);
    const deviceId = await installIdOf(tx);
    const sessionRows: (typeof session.$inferInsert)[] = [];
    const exerciseRows: (typeof sessionExercise.$inferInsert)[] = [];
    const setRows: (typeof sessionSet.$inferInsert)[] = [];

    for (const planned of sessions) {
      if (!sessionStartAllowed(planned.startedAt)) {
        throw new Error("A past workout starts within the last 10 years and not in the future");
      }
      const id = uuidv7();
      const start = Date.parse(planned.startedAt);
      const durationS = planned.durationS;
      const parsed = sessionInput.parse({
        workout_id: null,
        program_id: null,
        run_id: null,
        slot_id: null,
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
      });
      sessionRows.push({
        id,
        user_id: userId,
        import_batch_id: batchId,
        created_at: nowIso(),
        ...parsed,
      });

      const groups = new Map<string, string>();
      const exerciseKeys = keysAfterLast([], planned.exercises.length);
      let ticked = 0;
      for (const [exerciseIndex, entry] of planned.exercises.entries()) {
        const exerciseRowId = uuidv7();
        let group: string | null = null;
        if (entry.supersetKey !== null) {
          group = groups.get(entry.supersetKey) ?? uuidv7();
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
          created_at: nowIso(),
          ...exerciseRow,
        });
        const setKeys = keysAfterLast([], entry.sets.length);
        for (const [setIndex, set] of entry.sets.entries()) {
          setRows.push({
            id: uuidv7(),
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
            created_at: nowIso(),
          });
          ticked += 1;
        }
      }
    }

    for (let at = 0; at < sessionRows.length; at += INSERT_CHUNK) {
      await tx.insert(session).values(sessionRows.slice(at, at + INSERT_CHUNK));
    }
    for (let at = 0; at < exerciseRows.length; at += INSERT_CHUNK) {
      await tx.insert(sessionExercise).values(exerciseRows.slice(at, at + INSERT_CHUNK));
    }
    for (let at = 0; at < setRows.length; at += INSERT_CHUNK) {
      await tx.insert(sessionSet).values(setRows.slice(at, at + INSERT_CHUNK));
    }
    return { sessions: sessionRows.length, sets: setRows.length };
  });
}

/**
 * Deletes up to `limit` Sessions of an import, with their exercises and sets (the server
 * soft-deletes them as it does any discarded Session). Returns how many went and how many remain,
 * so Undo can run in small steps and show progress. Nothing outside the batch is touched.
 */
export function undoImportChunk(
  database: TrainingDatabase,
  batchId: string,
  limit: number,
  expectedInstallId?: string,
): Promise<{ deleted: number; remaining: number }> {
  return write(database, expectedInstallId, async (tx) => {
    const rows = await tx
      .select({ id: session.id })
      .from(session)
      .where(eq(session.import_batch_id, batchId))
      .limit(limit);
    const ids = rows.map((row) => row.id);
    if (ids.length > 0) {
      await tx
        .delete(sessionSet)
        .where(
          inArray(
            sessionSet.session_exercise_id,
            tx
              .select({ id: sessionExercise.id })
              .from(sessionExercise)
              .where(inArray(sessionExercise.session_id, ids)),
          ),
        );
      await tx.delete(sessionExercise).where(inArray(sessionExercise.session_id, ids));
      await tx
        .delete(session)
        .where(and(eq(session.import_batch_id, batchId), inArray(session.id, ids)));
    }
    const left = await tx
      .select({ id: session.id })
      .from(session)
      .where(eq(session.import_batch_id, batchId))
      .limit(1);
    return { deleted: ids.length, remaining: left.length };
  });
}

// ---- Reads ----

const KNOWN_PAGE = 5000;

const knownRow = z.object({ id: z.string(), started_at: z.string(), exercise_id: z.string() });

/**
 * The finished Sessions that started in the window, with their exercise ids, to recognise a
 * workout that is in the app already. Read in pages, so a long history does not load at once.
 */
export async function readKnownSessions(
  database: AbstractPowerSyncDatabase,
  window: { from: string; to: string },
): Promise<KnownSession[]> {
  const known = new Map<string, { startedAt: string; exerciseIds: string[] }>();
  for (let offset = 0; ; offset += KNOWN_PAGE) {
    const result = await database.getAll(
      `SELECT s.id AS id, s.started_at AS started_at, e.exercise_id AS exercise_id
       FROM training_session s JOIN session_exercise e ON e.session_id = s.id
       WHERE s.finished_at IS NOT NULL AND s.started_at >= ? AND s.started_at <= ?
       ORDER BY s.started_at, s.id, e.id LIMIT ? OFFSET ?`,
      [window.from, window.to, KNOWN_PAGE, offset],
    );
    const rows = z.array(knownRow).parse(result);
    for (const row of rows) {
      const item = known.get(row.id) ?? { startedAt: row.started_at, exerciseIds: [] };
      item.exerciseIds.push(row.exercise_id);
      known.set(row.id, item);
    }
    if (rows.length < KNOWN_PAGE) break;
  }
  return [...known.values()];
}

/** What an import left in the app now: its Sessions still present. */
export type ImportedSessions = { sessions: number; firstAt: string | null; lastAt: string | null };

const importedRow = z.object({
  sessions: z.number(),
  first_at: z.string().nullable(),
  last_at: z.string().nullable(),
});

/** Watches the Sessions of one import, so the receipt follows an Undo (or a delete elsewhere). */
export function watchImportedSessions(
  database: AbstractPowerSyncDatabase,
  batchId: string,
  onValue: (value: ImportedSessions) => void,
  onError: () => void,
) {
  const controller = new AbortController();
  database.watchWithCallback(
    `SELECT COUNT(*) AS sessions, MIN(started_at) AS first_at, MAX(started_at) AS last_at
     FROM training_session WHERE import_batch_id = ?`,
    [batchId],
    {
      onResult: (result) => {
        const parsed = z.array(importedRow).safeParse(result.array);
        const [row] = parsed.success ? parsed.data : [];
        if (row) onValue({ sessions: row.sessions, firstAt: row.first_at, lastAt: row.last_at });
        else onError();
      },
      onError,
    },
    { signal: controller.signal, tables: ["training_session"] },
  );
  return () => controller.abort();
}
