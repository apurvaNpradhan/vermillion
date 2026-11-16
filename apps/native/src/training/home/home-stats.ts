import { calendarDay, weekRange, type WeekStart } from "@workspace/shared";

const DAY_MS = 86_400_000;

/** One day of the week strip, in column order of the user's week. */
export type WeekCell = { day: number; trained: boolean; today: boolean };

/** The seven days of the current week; a day is trained if a Session started on it. */
export function weekCells(
  starts: readonly string[],
  now: Date,
  timezone: string,
  weekStart: WeekStart,
): WeekCell[] {
  const today = calendarDay(now, timezone);
  const { start } = weekRange(now, timezone, weekStart);
  const trained = new Set(starts.map((instant) => calendarDay(instant, timezone)));
  return Array.from({ length: 7 }, (_, index) => {
    const day = start + index * DAY_MS;
    return { day, trained: trained.has(day), today: day === today };
  });
}

/** The Sessions that started in the week `weeksAgo` weeks before the current one. */
export function sessionsInWeek<T extends { started_at: string }>(
  sessions: readonly T[],
  now: Date,
  timezone: string,
  weekStart: WeekStart,
  weeksAgo = 0,
): T[] {
  const { start } = weekRange(now, timezone, weekStart);
  const from = start - weeksAgo * 7 * DAY_MS;
  return sessions.filter((session) => {
    const day = calendarDay(session.started_at, timezone);
    return day >= from && day < from + 7 * DAY_MS;
  });
}

/** How many of the days (`YYYY-MM-DD`) a weigh-in was logged on fall in the current week. */
export function weighInsInWeek(
  days: readonly { date: string; logged: boolean }[],
  now: Date,
  timezone: string,
  weekStart: WeekStart,
): number {
  const first = new Date(weekRange(now, timezone, weekStart).start).toISOString().slice(0, 10);
  return days.filter((day) => day.logged && day.date >= first).length;
}

/** `count` days ending today, oldest first; true where a Session started on that day. */
export function trailingDays(
  starts: readonly string[],
  now: Date,
  timezone: string,
  count: number,
): boolean[] {
  const today = calendarDay(now, timezone);
  const trained = new Set(starts.map((start) => calendarDay(start, timezone)));
  return Array.from({ length: count }, (_, index) =>
    trained.has(today - (count - 1 - index) * DAY_MS),
  );
}

/** The change from `previous` to `current` as a ratio (0.06 = +6%); null when `previous` is zero. */
export function ratioChange(current: number, previous: number): number | null {
  return previous > 0 ? (current - previous) / previous : null;
}
