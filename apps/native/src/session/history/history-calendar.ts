import {
  calendarDay,
  sessionTotals,
  weekColumn,
  weekStartDay,
  type WeekStart,
} from "@workspace/shared";
import type { FinishedSession } from "@workspace/sync";

export const DAY_MS = 86_400_000;
export const WEEK_MS = 7 * DAY_MS;

export type Period = "week" | "month" | "year" | "all";
export type Totals = { workouts: number; sets: number; volume: number; seconds: number };
type Bucket = { sessions: FinishedSession[]; totals: Totals };

export const emptyTotals: Totals = { workouts: 0, sets: 0, volume: 0, seconds: 0 };

export function periodStart(period: Period, day: number, weekStart: WeekStart): number {
  const date = new Date(day);
  switch (period) {
    case "week":
      return weekStartDay(day, weekStart);
    case "month":
      return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
    case "year":
      return Date.UTC(date.getUTCFullYear(), 0, 1);
    case "all":
      return day;
  }
}

export function shiftPeriod(period: Period, start: number, delta: number): number {
  const date = new Date(start);
  switch (period) {
    case "week":
      return start + delta * WEEK_MS;
    case "month":
      return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + delta, 1);
    case "year":
      return Date.UTC(date.getUTCFullYear() + delta, 0, 1);
    case "all":
      return start;
  }
}

/**
 * The local days (UTC-midnight stamps, `[from, to)`) a visible period reads: its whole year plus
 * a week either side, so week counts at the edges and the previous week are complete. Moving
 * between weeks, months and years of one year therefore needs no new read. `null` for All, which
 * reads everything.
 */
export function historyWindow(period: Period, start: number, weekStart: WeekStart) {
  if (period === "all") return null;
  const year = new Date(start).getUTCFullYear();
  return {
    from: weekStartDay(Date.UTC(year, 0, 1), weekStart) - WEEK_MS,
    to: weekStartDay(Date.UTC(year, 11, 31), weekStart) + 2 * WEEK_MS,
  };
}

/** Week-aligned rows with padding outside the month. All dates are UTC calendar days. */
export function monthRows(start: number, weekStart: WeekStart) {
  const lead = weekColumn(new Date(start).getUTCDay(), weekStart);
  const end = shiftPeriod("month", start, 1);
  const length = (end - start) / DAY_MS;
  return Array.from({ length: Math.ceil((lead + length) / 7) }, (_, row) => {
    const week = start + (row * 7 - lead) * DAY_MS;
    return {
      week,
      days: Array.from({ length: 7 }, (_, column) => {
        const day = week + column * DAY_MS;
        return day >= start && day < end ? day : null;
      }),
    };
  });
}

function summarizeSession(session: FinishedSession, bodyweightKg: number | null): Totals {
  const { sets, volume } = sessionTotals(session.sets, bodyweightKg);
  const seconds =
    session.durationS ??
    Math.max(
      0,
      (Date.parse(session.finished_at ?? session.started_at) - Date.parse(session.started_at)) /
        1000,
    );
  return { workouts: 1, sets, volume, seconds };
}

function addTotals(target: Totals, source: Totals) {
  target.workouts += source.workouts;
  target.sets += source.sets;
  target.volume += source.volume;
  target.seconds += source.seconds;
}

export function buildHistory(
  sessions: readonly FinishedSession[],
  timezone: string,
  weekStart: WeekStart,
  bodyweightOn: (day: number) => number | null,
) {
  const byDay = new Map<number, FinishedSession[]>();
  const byWeek = new Map<number, Bucket>();
  const byMonth = new Map<number, Bucket>();
  const byYear = new Map<number, Bucket>();
  const weekCounts = new Map<number, number>();
  const bySession = new Map<string, { day: number; totals: Totals }>();
  const totals = { ...emptyTotals };
  let firstDay: number | null = null;
  const addToBucket = (
    buckets: Map<number, Bucket>,
    key: number,
    row: FinishedSession,
    stats: Totals,
  ) => {
    const bucket = buckets.get(key) ?? { sessions: [], totals: { ...emptyTotals } };
    bucket.sessions.push(row);
    addTotals(bucket.totals, stats);
    buckets.set(key, bucket);
  };

  // The local read already orders sessions newest first, with ID as a stable tie-breaker.
  for (const session of sessions) {
    const day = calendarDay(session.started_at, timezone);
    const week = weekStartDay(day, weekStart);
    const stats = summarizeSession(session, bodyweightOn(day));
    const daily = byDay.get(day) ?? [];
    daily.push(session);
    byDay.set(day, daily);
    bySession.set(session.id, { day, totals: stats });
    addToBucket(byWeek, week, session, stats);
    addToBucket(byMonth, periodStart("month", day, weekStart), session, stats);
    addToBucket(byYear, periodStart("year", day, weekStart), session, stats);
    weekCounts.set(week, (weekCounts.get(week) ?? 0) + 1);
    addTotals(totals, stats);
    firstDay = firstDay === null ? day : Math.min(firstDay, day);
  }
  return { sessions, byDay, byWeek, byMonth, byYear, bySession, weekCounts, totals, firstDay };
}

export type History = ReturnType<typeof buildHistory>;

export function goalHit(count: number, goal: number | null) {
  return goal !== null && goal > 0 && count >= goal;
}

export function goalStreaks(
  counts: ReadonlyMap<number, number>,
  goal: number | null,
  currentWeek: number,
) {
  let longest = 0;
  let streak = 0;
  let previous: number | undefined;
  const hit = [];
  for (const [week, count] of counts) {
    if (week <= currentWeek && goalHit(count, goal)) hit.push(week);
  }
  for (const week of hit.sort((a, b) => a - b)) {
    streak = previous !== undefined && week - previous === WEEK_MS ? streak + 1 : 1;
    longest = Math.max(longest, streak);
    previous = week;
  }
  // An incomplete current week can still be completed. A missed closed week breaks the streak.
  const current = previous === currentWeek || previous === currentWeek - WEEK_MS ? streak : 0;
  return { current, longest };
}

export function yearGoal(
  counts: ReadonlyMap<number, number>,
  goal: number | null,
  yearStart: number,
  weekStart: WeekStart,
  currentWeek: number,
) {
  // The fourth day assigns a split week to the year containing most of it.
  const start = weekStartDay(yearStart + 3 * DAY_MS, weekStart);
  const end = weekStartDay(shiftPeriod("year", yearStart, 1) + 3 * DAY_MS, weekStart);
  let reached = 0;
  for (let week = start; week < end && week <= currentWeek; week += WEEK_MS) {
    if (goalHit(counts.get(week) ?? 0, goal)) reached += 1;
  }
  return { reached, total: (end - start) / WEEK_MS };
}

export function monthlyWorkouts(history: History, today: number, weekStart: WeekStart) {
  const months: { month: number; count: number }[] = [];
  if (history.firstDay === null) return months;
  const first = periodStart("month", history.firstDay, weekStart);
  const last = periodStart("month", today, weekStart);
  for (let month = first; month <= last; month = shiftPeriod("month", month, 1)) {
    months.push({ month, count: history.byMonth.get(month)?.totals.workouts ?? 0 });
  }
  return months;
}
