import { REST_SECONDS_MAX } from "@workspace/shared";

export const REST_STEP_SECONDS = 15;
export const REST_MIN_SECONDS = 15;
export const REST_MAX_SECONDS = REST_SECONDS_MAX;

/** "2:00", "0:15", "10:00". */
export function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/** Rest one stepper press away, in 15 s steps between 0:15 and 10:00. */
export function stepRest(current: number, direction: 1 | -1): number {
  const next = Math.round((current + direction * REST_STEP_SECONDS) / REST_STEP_SECONDS);
  return Math.min(REST_MAX_SECONDS, Math.max(REST_MIN_SECONDS, next * REST_STEP_SECONDS));
}

/** The rest an exercise gets when Off is switched back on: its remembered value, else the default. */
export function restWhenOn(remembered: number | null, fallback: number): number {
  const base = remembered ?? fallback;
  return Math.min(REST_MAX_SECONDS, Math.max(REST_MIN_SECONDS, base));
}

export const MIN_DURATION_SECONDS = 5;
export const MAX_DURATION_SECONDS = 86_400;

/** A target duration one press away: 5 s steps under a minute, 15 s under five, then 30 s. */
export function stepDuration(current: number, direction: 1 | -1): number {
  const basis = direction === -1 ? current - 1 : current;
  const size = basis < 60 ? 5 : basis < 300 ? 15 : 30;
  const next = Math.round((current + direction * size) / size) * size;
  return Math.min(MAX_DURATION_SECONDS, Math.max(MIN_DURATION_SECONDS, next));
}
