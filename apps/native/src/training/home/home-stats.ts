import {
  calendarDay,
  sessionTotals,
  weekRange,
  type SessionHistory,
  type WeekStart,
} from "@workspace/shared";

import { plannedDay, stripDays } from "../../platform/ui/week-strip-math";

const DAY_MS = 86_400_000;

/** The Home week strip: its seven days, the Session each trained day opens, and the planned day. */
export type HomeWeek = {
  days: number[];
  today: number;
  /** The latest Session that started on each trained day of the week. */
  sessionByDay: Map<number, string>;
  /** The day the next workout is planned for, or null when no workout is up next. */
  planned: number | null;
};

export function homeWeek(
  sessions: readonly { id: string; started_at: string }[],
  now: Date,
  timezone: string,
  weekStart: WeekStart,
  hasNextWorkout: boolean,
): HomeWeek {
  const days = stripDays(weekRange(now, timezone, weekStart).start);
  const today = calendarDay(now, timezone);
  const latest = new Map<number, { id: string; started_at: string }>();
  for (const session of sessions) {
    const day = calendarDay(session.started_at, timezone);
    if (!days.includes(day)) continue;
    const known = latest.get(day);
    if (!known || known.started_at < session.started_at) latest.set(day, session);
  }
  const sessionByDay = new Map([...latest].map(([day, session]) => [day, session.id]));
  return {
    days,
    today,
    sessionByDay,
    planned: hasNextWorkout ? plannedDay(days, new Set(sessionByDay.keys()), today) : null,
  };
}

/** The Sessions that started in the week `weeksAgo` weeks before the current one. */
export function sessionsInWeek<T extends { started_at: string }>(
  sessions: readonly T[],
  now: Date,
  timezone: string,
  weekStart: WeekStart,
  weeksAgo = 0,
  days = 7,
): T[] {
  const { start } = weekRange(now, timezone, weekStart);
  const from = start - weeksAgo * 7 * DAY_MS;
  return sessions.filter((session) => {
    const day = calendarDay(session.started_at, timezone);
    return day >= from && day < from + days * DAY_MS;
  });
}

/** Both weeks through today's local weekday, inclusive. */
export function comparableWeekSessions<T extends { started_at: string }>(
  sessions: readonly T[],
  now: Date,
  timezone: string,
  weekStart: WeekStart,
) {
  const { start } = weekRange(now, timezone, weekStart);
  const days = (calendarDay(now, timezone) - start) / DAY_MS + 1;
  return {
    current: sessionsInWeek(sessions, now, timezone, weekStart, 0, days),
    previous: sessionsInWeek(sessions, now, timezone, weekStart, 1, days),
  };
}

/** The change from `previous` to `current` as a ratio (0.06 = +6%); null when `previous` is zero. */
export function ratioChange(current: number, previous: number): number | null {
  return previous > 0 ? (current - previous) / previous : null;
}

/** This week's Counted sets and volume, and each one's change on the same days of last week. */
export type WeekSummary = {
  sessions: number;
  sets: number;
  volume: number;
  setsChange: number | null;
  volumeChange: number | null;
};

export function weekSummary(
  current: readonly Pick<SessionHistory, "sets">[],
  previous: readonly Pick<SessionHistory, "sets">[],
  bodyweightKg: number | null,
): WeekSummary {
  const totals = (sessions: readonly Pick<SessionHistory, "sets">[]) =>
    sessionTotals(
      sessions.flatMap((session) => session.sets),
      bodyweightKg,
    );
  const now = totals(current);
  const before = totals(previous);
  return {
    sessions: current.length,
    sets: now.sets,
    volume: now.volume,
    setsChange: ratioChange(now.sets, before.sets),
    volumeChange: ratioChange(now.volume, before.volume),
  };
}

/** How far through the goal a week is, 0 to 1; 0 when there is no goal. */
export function goalFraction(done: number, goal: number | null): number {
  return goal === null || goal <= 0 ? 0 : Math.min(1, done / goal);
}
