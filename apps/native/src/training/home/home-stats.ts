const DAY_MS = 86_400_000;

/** The calendar day of an instant in `timezone`, as UTC midnight, so days subtract exactly. */
export function calendarDay(instant: Date | string, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(instant));
  const part = (name: string) => Number(parts.find((item) => item.type === name)?.value);
  return Date.UTC(part("year"), part("month") - 1, part("day"));
}

/** The Monday that starts the week of a calendar day. */
export function weekStart(day: number): number {
  return day - ((new Date(day).getUTCDay() + 6) % 7) * DAY_MS;
}

/** One day of the week strip, Monday first. */
export type WeekCell = { day: number; trained: boolean; today: boolean };

/** The seven days of the current week (Monday to Sunday); a day is trained if a Session started on it. */
export function weekCells(starts: readonly string[], now: Date, timezone: string): WeekCell[] {
  const today = calendarDay(now, timezone);
  const first = weekStart(today);
  const trained = new Set(starts.map((start) => calendarDay(start, timezone)));
  return Array.from({ length: 7 }, (_, index) => {
    const day = first + index * DAY_MS;
    return { day, trained: trained.has(day), today: day === today };
  });
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
