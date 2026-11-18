import { calendarDay } from "@workspace/shared";

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** Never sleep longer than this, so a clock change or a long suspend is noticed on wake. */
const MAX_WAIT_MS = HOUR_MS;

/**
 * Milliseconds from `now` until the next local midnight in `timezone`, read from the wall clock's
 * hour, minute and second. A day with a DST change is an hour off, which the caller absorbs by
 * checking the day again when the timer fires. At least one second, so a timer never spins.
 */
export function msUntilNextDay(now: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(now);
  const part = (kind: string) => Number(parts.find((item) => item.type === kind)?.value);
  const elapsed =
    part("hour") * HOUR_MS +
    part("minute") * MINUTE_MS +
    part("second") * SECOND_MS +
    (now.getTime() % SECOND_MS);
  return Math.max(SECOND_MS, DAY_MS - elapsed);
}

/** How long to wait before looking at the date again. */
export function nextCheckDelay(now: Date, timezone: string): number {
  return Math.min(MAX_WAIT_MS, msUntilNextDay(now, timezone) + SECOND_MS);
}

/** `current` when it is still the same local day as `now`, else `now`: the instant only moves at midnight. */
export function sameDayOrNow(current: Date, now: Date, timezone: string): Date {
  return calendarDay(current, timezone) === calendarDay(now, timezone) ? current : now;
}
