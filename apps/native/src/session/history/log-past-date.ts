import { calendarDay, fromZonedParts, SESSION_LIMITS, zonedParts } from "@workspace/shared";

export function logPastBounds(now: Date, timezone: string) {
  const earliest = new Date(now);
  earliest.setUTCFullYear(earliest.getUTCFullYear() - SESSION_LIMITS.backfillYears);
  return {
    min: calendarDay(earliest, timezone),
    today: calendarDay(now, timezone),
    earliest: earliest.getTime(),
    latest: now.getTime(),
  };
}

type Bounds = ReturnType<typeof logPastBounds>;

/** Move the start to the picked date while keeping the account-local time of day. */
export function logPastOnDay(start: string, day: number, timezone: string, bounds: Bounds) {
  const date = new Date(day);
  const instant = fromZonedParts(
    {
      ...zonedParts(start, timezone),
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
    },
    timezone,
  );
  const clamped = Math.min(bounds.latest, Math.max(bounds.earliest, Date.parse(instant)));
  return new Date(clamped).toISOString();
}
