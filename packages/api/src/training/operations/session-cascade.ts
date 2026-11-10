import type { DbExecutor } from "@workspace/db";
import { and, eq, inArray, isNull } from "drizzle-orm";

import { session, sessionExercise, sessionSet } from "../tables";

/**
 * Deleting a Session is a soft delete with one timestamp, and so is everything it takes with it.
 * Restoring clears only the rows carrying that same timestamp, so an exercise or set deleted on
 * its own earlier stays deleted (the same protocol as plans, ADR 0019).
 */

const exerciseIdsOfSession = (db: DbExecutor, sessionId: string) =>
  db
    .select({ id: sessionExercise.id })
    .from(sessionExercise)
    .where(eq(sessionExercise.sessionId, sessionId));

/** Soft-deletes a Session with its exercises and their sets. */
export async function deleteSessionCascade(db: DbExecutor, id: string, now: Date) {
  const mark = { deletedAt: now, updatedAt: now };
  await db
    .update(sessionSet)
    .set(mark)
    .where(
      and(
        inArray(sessionSet.sessionExerciseId, exerciseIdsOfSession(db, id)),
        isNull(sessionSet.deletedAt),
      ),
    );
  await db
    .update(sessionExercise)
    .set(mark)
    .where(and(eq(sessionExercise.sessionId, id), isNull(sessionExercise.deletedAt)));
  await db
    .update(session)
    .set(mark)
    .where(and(eq(session.id, id), isNull(session.deletedAt)));
}

/** Soft-deletes one Session exercise with its sets. */
export async function deleteSessionExerciseCascade(db: DbExecutor, id: string, now: Date) {
  const mark = { deletedAt: now, updatedAt: now };
  await db
    .update(sessionSet)
    .set(mark)
    .where(and(eq(sessionSet.sessionExerciseId, id), isNull(sessionSet.deletedAt)));
  await db
    .update(sessionExercise)
    .set(mark)
    .where(and(eq(sessionExercise.id, id), isNull(sessionExercise.deletedAt)));
}

const live = { deletedAt: null } as const;

/** Brings back what `deleteSessionCascade` took down at `at`, then the Session itself. */
export async function restoreSessionCascade(db: DbExecutor, id: string, at: Date, now: Date) {
  const mark = { ...live, updatedAt: now };
  await db
    .update(sessionSet)
    .set(mark)
    .where(
      and(
        inArray(sessionSet.sessionExerciseId, exerciseIdsOfSession(db, id)),
        eq(sessionSet.deletedAt, at),
      ),
    );
  await db
    .update(sessionExercise)
    .set(mark)
    .where(and(eq(sessionExercise.sessionId, id), eq(sessionExercise.deletedAt, at)));
  await db
    .update(session)
    .set(mark)
    .where(and(eq(session.id, id), eq(session.deletedAt, at)));
}

/** Brings back what `deleteSessionExerciseCascade` took down at `at`, then the exercise itself. */
export async function restoreSessionExerciseCascade(
  db: DbExecutor,
  id: string,
  at: Date,
  now: Date,
) {
  const mark = { ...live, updatedAt: now };
  await db
    .update(sessionSet)
    .set(mark)
    .where(and(eq(sessionSet.sessionExerciseId, id), eq(sessionSet.deletedAt, at)));
  await db
    .update(sessionExercise)
    .set(mark)
    .where(and(eq(sessionExercise.id, id), eq(sessionExercise.deletedAt, at)));
}
