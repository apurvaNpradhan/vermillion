/**
 * The Session's clock: the time spent training, which is the time since it started minus the
 * time it was paused. Every duration in the app goes through {@link sessionActiveMs}.
 *
 * A Session stores `paused_at` (set while paused, else null) and `paused_ms` (the paused time
 * already settled by earlier resumes). All functions are pure: the caller passes the time.
 */
export type SessionClock = {
  /** ISO time the Session started. */
  startedAt: string;
  /** ISO time the current pause began; null while the Session runs. */
  pausedAt: string | null;
  /** Total milliseconds of earlier pauses. */
  pausedMs: number;
};

/** A pause left this long is ended for the user: the Session carries on as if resumed. */
export const PAUSE_AUTO_RESUME_MS = 4 * 60 * 60 * 1000;

const parse = (value: string) => {
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : time;
};

/**
 * Milliseconds trained up to `endMs` (the finish time, or now): start to end, minus settled
 * pauses, minus the pause in progress. Never negative, so a clock set back reads 0.
 */
export function sessionActiveMs(clock: SessionClock, endMs: number): number {
  const start = parse(clock.startedAt);
  if (start === null) return 0;
  const pausedAt = clock.pausedAt === null ? null : parse(clock.pausedAt);
  const open = pausedAt === null ? 0 : Math.max(0, endMs - pausedAt);
  return Math.max(0, endMs - start - Math.max(0, clock.pausedMs) - open);
}

/** {@link sessionActiveMs} in whole seconds. */
export function sessionActiveSeconds(clock: SessionClock, endMs: number): number {
  return Math.floor(sessionActiveMs(clock, endMs) / 1000);
}

/**
 * A Session's duration in seconds: the user's override if set, else the time trained between
 * start and finish (or `now` while it is running).
 */
export function sessionDurationSeconds(
  session: {
    durationS: number | null;
    startedAt: string;
    finishedAt: string | null;
    pausedAt?: string | null;
    pausedMs?: number;
  },
  now: number,
): number {
  if (session.durationS !== null) return session.durationS;
  const end = session.finishedAt === null ? now : (parse(session.finishedAt) ?? now);
  return sessionActiveSeconds(
    {
      startedAt: session.startedAt,
      pausedAt: session.pausedAt ?? null,
      pausedMs: session.pausedMs ?? 0,
    },
    end,
  );
}

/** Pauses the clock at `nowMs`; a clock already paused is returned unchanged. */
export function pauseClock(clock: SessionClock, nowMs: number): SessionClock {
  if (clock.pausedAt !== null) return clock;
  return { ...clock, pausedAt: new Date(nowMs).toISOString() };
}

export type Resumed = {
  clock: SessionClock;
  /** How long the pause that just ended lasted; 0 when the clock was running. */
  spanMs: number;
};

/** Resumes at `atMs`: the pause joins `pausedMs`. A running clock is returned unchanged. */
export function resumeClock(clock: SessionClock, atMs: number): Resumed {
  if (clock.pausedAt === null) return { clock, spanMs: 0 };
  const pausedAt = parse(clock.pausedAt);
  const spanMs =
    pausedAt === null ? 0 : Math.min(PAUSE_AUTO_RESUME_MS, Math.max(0, atMs - pausedAt));
  return {
    clock: {
      startedAt: clock.startedAt,
      pausedAt: null,
      pausedMs: Math.min(Number.MAX_SAFE_INTEGER, clock.pausedMs + spanMs),
    },
    spanMs,
  };
}

/** Finishing while paused resumes at the finish: the open pause is counted as paused. */
export function finishClock(clock: SessionClock, finishedAtMs: number): SessionClock {
  return resumeClock(clock, finishedAtMs).clock;
}

/** When a pause that began at `pausedAt` is ended for the user, as a time in ms. */
export function pauseExpiresAt(pausedAt: string): number {
  const at = parse(pausedAt);
  return (at ?? 0) + PAUSE_AUTO_RESUME_MS;
}

/** Whether the pause has lasted long enough to be ended for the user. */
export function pauseExpired(clock: SessionClock, nowMs: number): boolean {
  return clock.pausedAt !== null && nowMs >= pauseExpiresAt(clock.pausedAt);
}

/** An absolute-time countdown: where it started, where it ends (ISO). */
export type TimedSpan = { startedAt: string; endsAt: string };

/**
 * Moves a countdown that was running when the Session paused (`pausedAt`) forward by the paused
 * span, so it has the same time left after the resume. A countdown that had already ended, or
 * has no valid times, is returned unchanged.
 */
export function shiftForPause(span: TimedSpan, pausedAtMs: number, spanMs: number): TimedSpan {
  const end = parse(span.endsAt);
  const start = parse(span.startedAt);
  if (end === null || start === null || spanMs <= 0 || start > pausedAtMs || end <= pausedAtMs)
    return span;
  return {
    startedAt: new Date(start + spanMs).toISOString(),
    endsAt: new Date(end + spanMs).toISOString(),
  };
}

/** Why a new start time is refused. */
export type StartEditProblem = "invalid" | "future" | "after-tick" | "after-pause" | "too-old";

/**
 * Whether the Session may start at `candidate`: a real time, not in the future, not after the
 * first ticked set or the start of the current pause, and not before the backfill window.
 */
export function checkStartEdit(input: {
  candidate: string;
  nowMs: number;
  firstTickedAt: string | null;
  pausedAt: string | null;
  earliestMs: number;
}): StartEditProblem | null {
  const at = parse(input.candidate);
  if (at === null) return "invalid";
  if (at > input.nowMs) return "future";
  if (at < input.earliestMs) return "too-old";
  const tick = input.firstTickedAt === null ? null : parse(input.firstTickedAt);
  if (tick !== null && at > tick) return "after-tick";
  const paused = input.pausedAt === null ? null : parse(input.pausedAt);
  if (paused !== null && at > paused) return "after-pause";
  return null;
}
