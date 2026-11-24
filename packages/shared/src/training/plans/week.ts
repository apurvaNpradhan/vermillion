import { type WeekStart } from "../vocabulary/vocabulary";

const DAY_MS = 86_400_000;

/** `Date.getUTCDay()` of the first day of each week start (0 is Sunday). */
const START_WEEKDAY = { monday: 1, sunday: 0, saturday: 6 } as const satisfies Record<
  WeekStart,
  number
>;

let dayFormatter: { timezone: string; format: Intl.DateTimeFormat } | undefined;

/** The calendar day of an instant in `timezone`, as UTC midnight, so days subtract exactly. */
export function calendarDay(instant: Date | string, timezone: string): number {
  if (dayFormatter?.timezone !== timezone) {
    dayFormatter = {
      timezone,
      format: new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }),
    };
  }
  const parts = dayFormatter.format.formatToParts(new Date(instant));
  const part = (kind: string) => Number(parts.find((item) => item.type === kind)?.value);
  return Date.UTC(part("year"), part("month") - 1, part("day"));
}

/** The first day of the week that holds `day` (UTC midnight), whatever the week starts on. */
export function weekStartDay(day: number, weekStart: WeekStart): number {
  const offset = (new Date(day).getUTCDay() - START_WEEKDAY[weekStart] + 7) % 7;
  return day - offset * DAY_MS;
}

/** A week as calendar days: `start` is the first and `end` the first day of the next week. */
export type WeekRange = { start: number; end: number };

/**
 * The week that holds an instant in the user's zone: `start` is its first calendar day and `end`
 * the first day of the next week (UTC midnights, so DST never changes a week's length). This is the
 * one definition of "this week"; every weekly figure in the app goes through it.
 */
export function weekRange(
  instant: Date | string,
  timezone: string,
  weekStart: WeekStart,
): WeekRange {
  const start = weekStartDay(calendarDay(instant, timezone), weekStart);
  return { start, end: start + 7 * DAY_MS };
}

/** The first day of an instant's week as `YYYY-MM-DD`, to group things by week. */
export function weekStartKey(instant: string, timezone: string, weekStart: WeekStart): string {
  return new Date(weekRange(instant, timezone, weekStart).start).toISOString().slice(0, 10);
}

/** The weekdays in column order, as `Date.getUTCDay()` numbers: Monday start is 1, 2, ... 6, 0. */
export function weekDays(weekStart: WeekStart): readonly number[] {
  return Array.from({ length: 7 }, (_, index) => (START_WEEKDAY[weekStart] + index) % 7);
}

/** The column (0 to 6) a weekday (`getUTCDay`) takes when the week starts on `weekStart`. */
export function weekColumn(weekday: number, weekStart: WeekStart): number {
  return (weekday - START_WEEKDAY[weekStart] + 7) % 7;
}
