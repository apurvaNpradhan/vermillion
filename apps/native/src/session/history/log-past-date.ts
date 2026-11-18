import {
  calendarDay,
  fromZonedParts,
  SESSION_LIMITS,
  sessionStartAllowed,
  zonedParts,
} from "@workspace/shared";

const MINUTE_MS = 60_000;
/**
 * The earliest selectable minute sits this far inside the backfill window, so a start picked at
 * the edge is still allowed when the user saves a little later.
 */
const BOUNDARY_MARGIN_MS = 60 * MINUTE_MS;

export function logPastBounds(now: Date, timezone: string) {
  const earliest = new Date(now);
  earliest.setUTCFullYear(earliest.getUTCFullYear() - SESSION_LIMITS.backfillYears);
  // Round up to a whole minute (the steppers move by minutes) and keep clear of the window edge.
  const selectable = Math.ceil((earliest.getTime() + BOUNDARY_MARGIN_MS) / MINUTE_MS) * MINUTE_MS;
  return {
    min: calendarDay(new Date(selectable), timezone),
    today: calendarDay(now, timezone),
    earliest: selectable,
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

/**
 * The start to save, checked against a fresh clock. The screen may have been open for a while, so
 * a start that has since slid out of the window moves to the new earliest selectable minute
 * instead of failing. Null when the value is not a date or is still not allowed.
 */
export function logPastForSave(start: string, now: Date, timezone: string): string | null {
  const parsed = Date.parse(start);
  if (!Number.isFinite(parsed)) return null;
  const bounds = logPastBounds(now, timezone);
  const clamped = new Date(
    Math.min(bounds.latest, Math.max(bounds.earliest, parsed)),
  ).toISOString();
  return sessionStartAllowed(clamped, now) ? clamped : null;
}
