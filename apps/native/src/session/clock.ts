/** Whole seconds since `startedAt`; never negative, so a clock set back shows 0:00 rather than a minus. */
export function elapsedSeconds(startedAt: string, now: number): number {
  const start = Date.parse(startedAt);
  if (Number.isNaN(start)) return 0;
  return Math.max(0, Math.floor((now - start) / 1000));
}

/** "0:05", "12:30", "1:02:03": minutes and seconds, with hours once there are any. */
export function formatElapsed(totalSeconds: number): string {
  const whole = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const seconds = whole % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

/** An absolute-time countdown: where it started, where it ends. */
export type Countdown = { startedAt: string; endsAt: string };

/** How long the countdown was set for, in whole seconds. */
export function totalSeconds(countdown: Countdown): number {
  return Math.max(
    0,
    Math.ceil((Date.parse(countdown.endsAt) - Date.parse(countdown.startedAt)) / 1000),
  );
}

/**
 * Seconds left, from the stored timestamps and the clock now. A clock that jumps back cannot
 * show more than the countdown was set for; one that jumps forward ends it early. Never
 * negative.
 */
export function remainingSeconds(countdown: Countdown, now: number): number {
  const end = Date.parse(countdown.endsAt);
  if (Number.isNaN(end)) return 0;
  const left = Math.ceil((end - now) / 1000);
  return Math.min(totalSeconds(countdown), Math.max(0, left));
}

/** 0 at the start, 1 at the end: the width of the thin progress line. */
export function countdownProgress(countdown: Countdown, now: number): number {
  const total = totalSeconds(countdown);
  return total === 0 ? 1 : 1 - remainingSeconds(countdown, now) / total;
}
