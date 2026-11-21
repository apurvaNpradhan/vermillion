import { calendarDay, weekRange, type WeekStart } from "@workspace/shared";

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
