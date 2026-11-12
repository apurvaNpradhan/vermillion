/**
 * Pure helpers for editing a workout's start time and duration on the Save workout screen. All
 * times are in the device's own time zone, which is what the user sees on their clock.
 */

const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;

/** Whole hours and minutes of a duration; seconds below a minute are dropped. */
export function splitDuration(seconds: number) {
  const whole = Math.max(0, Math.floor(seconds / 60));
  return { hours: Math.floor(whole / 60), minutes: whole % 60 };
}

/** A duration in seconds from hours and minutes, never above `maxSeconds`. */
export function joinDuration(hours: number, minutes: number, maxSeconds: number): number {
  return Math.min(Math.max(0, Math.round(hours * 3600 + minutes * 60)), maxSeconds);
}

/** Steps a duration by `direction` hours or minutes, held between 0 and `maxSeconds`. */
export function stepDuration(
  seconds: number,
  unit: "hour" | "minute",
  direction: 1 | -1,
  maxSeconds: number,
): number {
  const step = unit === "hour" ? 3600 : 60;
  const { hours, minutes } = splitDuration(seconds);
  return Math.min(Math.max(0, hours * 3600 + minutes * 60 + step * direction), maxSeconds);
}

/** Midnights of today and the days before it, newest first: `count` days in all. */
export function recentDays(now: Date, count: number): Date[] {
  return Array.from(
    { length: count },
    (_, index) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - index),
  );
}

/** The same instant on another calendar day, keeping the time of day. */
export function onDay(startedAt: Date, day: Date): Date {
  return new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
    startedAt.getHours(),
    startedAt.getMinutes(),
    startedAt.getSeconds(),
  );
}

/** Whether two instants fall on the same calendar day. */
export function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Moves a start time by an hour or a minute, carrying across the day, and never into the future. */
export function stepStart(
  startedAt: Date,
  unit: "hour" | "minute",
  direction: 1 | -1,
  now: Date,
): Date {
  const moved = new Date(startedAt.getTime() + direction * (unit === "hour" ? HOUR_MS : MINUTE_MS));
  return moved.getTime() > now.getTime() ? new Date(now.getTime()) : moved;
}

/** A start time held to the moment it is edited at: no later than `now`. */
export function notAfter(startedAt: Date, now: Date): Date {
  return startedAt.getTime() > now.getTime() ? new Date(now.getTime()) : startedAt;
}
