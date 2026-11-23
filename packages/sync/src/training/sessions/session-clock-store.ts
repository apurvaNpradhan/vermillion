import {
  backfillEarliestMs,
  checkStartEdit,
  pauseExpiresAt,
  resumeClock,
  shiftForPause,
  type StartEditProblem,
} from "@workspace/shared";
import { and, eq, inArray, isNotNull, isNull, min } from "drizzle-orm";

import { write, type Tx, type TrainingDatabase } from "../store-common";
import { session, sessionExercise, sessionSet } from "../tables";
import { requireSession } from "./session-common";

/**
 * Resumes a paused Session inside a transaction the caller owns, as of `atMs`. The paused span
 * joins `paused_ms`, and what was counting down when the pause began moves forward by the span
 * (the Rest, and the timers of duration sets), so each has the same time left. Returns whether
 * the Session was paused. A write that makes the Session move (a tick, a started timer) calls
 * this first, so it never runs on a stopped clock.
 */
export async function resumeIn(tx: Tx, sessionId: string, atMs: number = Date.now()) {
  const current = await requireSession(tx, sessionId);
  if (current.paused_at === null || current.finished_at !== null) return false;
  const pausedAtMs = Date.parse(current.paused_at);
  const { clock, spanMs } = resumeClock(
    {
      startedAt: current.started_at,
      pausedAt: current.paused_at,
      pausedMs: current.paused_ms ?? 0,
    },
    atMs,
  );
  const rest =
    current.rest_started_at !== null && current.rest_ends_at !== null
      ? shiftForPause(
          { startedAt: current.rest_started_at, endsAt: current.rest_ends_at },
          pausedAtMs,
          spanMs,
        )
      : null;
  await tx
    .update(session)
    .set({
      paused_at: null,
      paused_ms: clock.pausedMs,
      ...(rest ? { rest_started_at: rest.startedAt, rest_ends_at: rest.endsAt } : {}),
    })
    .where(eq(session.id, sessionId));
  if (spanMs > 0) {
    const running = await tx
      .select({ id: sessionSet.id, timerStartedAt: sessionSet.timer_started_at })
      .from(sessionSet)
      .innerJoin(sessionExercise, eq(sessionSet.session_exercise_id, sessionExercise.id))
      .where(
        and(
          eq(sessionExercise.session_id, sessionId),
          isNotNull(sessionSet.timer_started_at),
          isNull(sessionSet.completed_at),
        ),
      );
    for (const set of running) {
      if (set.timerStartedAt === null) continue;
      const started = Date.parse(set.timerStartedAt);
      if (Number.isNaN(started) || started > pausedAtMs) continue;
      await tx
        .update(sessionSet)
        .set({ timer_started_at: new Date(started + spanMs).toISOString() })
        .where(eq(sessionSet.id, set.id));
    }
  }
  return true;
}

/**
 * Pauses the Session's clock: the duration, the Rest and running set timers stop until it is
 * resumed. Returns false when it is finished, gone or already paused.
 */
export function pauseSession(
  database: TrainingDatabase,
  sessionId: string,
  expectedInstallId?: string,
): Promise<boolean> {
  return write(database, expectedInstallId, async (tx) => {
    const current = await requireSession(tx, sessionId);
    if (
      current.finished_at !== null ||
      current.paused_at !== null ||
      (expectedInstallId !== undefined && current.device_id !== expectedInstallId)
    )
      return false;
    await tx
      .update(session)
      .set({ paused_at: new Date().toISOString() })
      .where(eq(session.id, sessionId));
    return true;
  });
}

/**
 * Resumes the Session's clock. `atMs` is when the pause is taken to end: now by default, and
 * `paused_at` plus the longest pause when a forgotten pause is ended for the user. Returns false
 * when it was not paused.
 */
export function resumeSession(
  database: TrainingDatabase,
  sessionId: string,
  expectedInstallId?: string,
  atMs?: number,
): Promise<boolean> {
  return write(database, expectedInstallId, async (tx) => {
    const current = await requireSession(tx, sessionId);
    if (expectedInstallId !== undefined && current.device_id !== expectedInstallId) return false;
    if (atMs !== undefined) {
      // A scheduled expiry can race with a later pause or a transfer to another device.
      if (
        current.paused_at === null ||
        pauseExpiresAt(current.paused_at) !== atMs ||
        atMs > Date.now()
      )
        return false;
    }
    return resumeIn(tx, sessionId, atMs);
  });
}

export type SetStartResult = { ok: true } | { ok: false; problem: StartEditProblem };

/**
 * Moves the start of a running Session. Not in the future, not after the first ticked set or the
 * start of the current pause, and inside the backfill window; otherwise nothing is written. The
 * duration is recomputed from the new start, with the paused time still left out.
 */
export function setSessionStart(
  database: TrainingDatabase,
  sessionId: string,
  startedAt: string,
  expectedInstallId?: string,
): Promise<SetStartResult> {
  return write(database, expectedInstallId, async (tx): Promise<SetStartResult> => {
    const current = await requireSession(tx, sessionId);
    if (current.finished_at !== null) throw new Error("The workout is finished");
    const exercises = await tx
      .select({ id: sessionExercise.id })
      .from(sessionExercise)
      .where(eq(sessionExercise.session_id, sessionId));
    const [first] = exercises.length
      ? await tx
          .select({ at: min(sessionSet.completed_at) })
          .from(sessionSet)
          .where(
            inArray(
              sessionSet.session_exercise_id,
              exercises.map((entry) => entry.id),
            ),
          )
      : [];
    const now = new Date();
    const problem = checkStartEdit({
      candidate: startedAt,
      nowMs: now.getTime(),
      firstTickedAt: first?.at ?? null,
      pausedAt: current.paused_at,
      earliestMs: backfillEarliestMs(now),
    });
    if (problem) return { ok: false, problem };
    await tx
      .update(session)
      .set({ started_at: new Date(startedAt).toISOString() })
      .where(eq(session.id, sessionId));
    return { ok: true };
  });
}
