import {
  calendarDay,
  sessionDurationSeconds,
  sessionsInRange,
  sessionTotals,
  shiftWeek,
  weekRange,
  type WeekStart,
} from "@workspace/shared";
import type { FinishedSession } from "@workspace/sync";

import { plannedDay, stripDays } from "../../platform/ui/week-strip-math";

const DAY_MS = 86_400_000;

/** The Home week strip: its seven days, which days were trained, and the planned day. */
export type HomeWeek = {
  days: number[];
  today: number;
  trained: ReadonlySet<number>;
  /** The day the next workout is planned for, or null when no workout is up next. */
  planned: number | null;
};

export function homeWeek(
  sessions: readonly { started_at: string }[],
  now: Date,
  timezone: string,
  weekStart: WeekStart,
  hasNextWorkout: boolean,
  weeksAgo = 0,
): HomeWeek {
  const days = stripDays(weekRange(now, timezone, weekStart).start - weeksAgo * 7 * DAY_MS);
  const today = calendarDay(now, timezone);
  const trained = new Set<number>();
  for (const session of sessions) {
    const day = calendarDay(session.started_at, timezone);
    if (days.includes(day)) trained.add(day);
  }
  return {
    days,
    today,
    trained,
    planned: hasNextWorkout ? plannedDay(days, trained, today) : null,
  };
}

export type WeekTotals = { sessions: number; sets: number; volumeKg: number };

type SummarySession = Pick<FinishedSession, "started_at" | "sets">;

function totalsOf(sessions: readonly SummarySession[]): WeekTotals {
  let sets = 0;
  let volumeKg = 0;
  for (const session of sessions) {
    const totals = sessionTotals(session.sets);
    sets += totals.sets;
    volumeKg += totals.volume;
  }
  return { sessions: sessions.length, sets, volumeKg };
}

export type WeekSummary = { current: WeekTotals; previous: WeekTotals };

/** This week's sessions, Counted sets and volume next to last week's, for the "This week" row. */
export function weekSummary(
  sessions: readonly SummarySession[],
  now: Date,
  timezone: string,
  weekStart: WeekStart,
): WeekSummary {
  const week = weekRange(now, timezone, weekStart);
  return {
    current: totalsOf(sessionsInRange(sessions, week, timezone)),
    previous: totalsOf(sessionsInRange(sessions, shiftWeek(week, 1), timezone)),
  };
}

/** The newest session of a workout, from sessions already ordered newest first; null if none. */
export function lastWorkoutSession<Session extends Pick<FinishedSession, "workoutId">>(
  sessions: readonly Session[],
  workoutId: string | null,
): Session | null {
  if (workoutId === null) return null;
  return sessions.find((session) => session.workoutId === workoutId) ?? null;
}

/** Whole minutes a finished session took, pauses left out. */
export function sessionMinutes(
  session: Pick<FinishedSession, "started_at" | "finished_at" | "durationS" | "pausedMs">,
): number {
  const seconds = sessionDurationSeconds(
    {
      durationS: session.durationS,
      startedAt: session.started_at,
      finishedAt: session.finished_at ?? session.started_at,
      pausedMs: session.pausedMs,
    },
    0,
  );
  return Math.round(seconds / 60);
}
