/** "2:00", "0:15", "10:00". */
export function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/** The rests the picker offers, in seconds. */
export const REST_CHOICES: readonly number[] = [30, 45, 60, 75, 90, 120, 150, 180, 240, 300];

/** The picker's rests, with the exercise's own value added in its place when it is not one. */
export function restChoices(current: number | null): number[] {
  const all =
    current === null || REST_CHOICES.includes(current) ? REST_CHOICES : [...REST_CHOICES, current];
  return [...all].sort((a, b) => a - b);
}

export const MAX_DURATION_SECONDS = 86_400;

/**
 * A duration typed as seconds ("90") or minutes and seconds ("1:30"). Empty is `undefined`; text
 * that is not a duration (yet) is `null`; zero is `undefined` too (no target).
 */
export function parseDuration(text: string): number | undefined | null {
  const cleaned = text.trim();
  if (cleaned === "") return undefined;
  const clock = /^(\d{1,4}):([0-5]?\d)$/.exec(cleaned);
  const total = clock
    ? Number(clock[1]) * 60 + Number(clock[2])
    : /^\d{1,6}$/.test(cleaned)
      ? Number(cleaned)
      : null;
  if (total === null) return null;
  return total === 0 ? undefined : Math.min(MAX_DURATION_SECONDS, total);
}
