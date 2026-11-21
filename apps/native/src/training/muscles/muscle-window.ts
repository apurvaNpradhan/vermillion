import {
  sessionsInRange,
  shiftWeek,
  weekRange,
  withWarmupsCounted,
  type SessionHistory,
  type WeekRange,
  type WeekStart,
} from "@workspace/shared";

const DAY_MS = 86_400_000;

/**
 * The days a muscle period covers. One week is the week `weeksAgo` back. Several weeks are that
 * many whole weeks ending the week before it, so the unfinished current week never drags a weekly
 * average down; the card calls it "Last 4 full weeks".
 */
export function muscleWindow(
  now: Date,
  timezone: string,
  weekStart: WeekStart,
  weeksAgo: number,
  weeks: number,
): WeekRange {
  const last = shiftWeek(weekRange(now, timezone, weekStart), weeksAgo + (weeks > 1 ? 1 : 0));
  return { start: last.start - (weeks - 1) * 7 * DAY_MS, end: last.end };
}

/** Sessions for muscle stats, with the viewer's warm-up preference applied to the raw sets. */
export function muscleSessionsInRange<Session extends SessionHistory>(
  sessions: readonly Session[],
  range: WeekRange,
  timezone: string,
  countWarmups: boolean,
): Session[] {
  return withWarmupsCounted(sessionsInRange(sessions, range, timezone), countWarmups);
}
