import { z } from "zod";

const DAY_MS = 86_400_000;

/** How long a Lighter week lasts once accepted. */
export const LIGHTER_WEEK_DAYS = 7;
/** How many past Lighter weeks are kept, newest last; older ones no longer matter to anything. */
export const LIGHTER_WEEKS_KEPT = 26;
/** A Lighter week suggests this share of the last load. */
export const LIGHTER_WEEK_LOAD = 0.9;

/** One Lighter week: from the moment it was accepted to when it ended (or was ended early). */
export const lighterPeriodSchema = z.object({ from: z.iso.datetime(), until: z.iso.datetime() });
export type LighterPeriod = z.infer<typeof lighterPeriodSchema>;

const within = (instant: number, period: LighterPeriod) =>
  instant >= Date.parse(period.from) && instant < Date.parse(period.until);

/** The Lighter week running at `now`, if any. */
export function activeLighterWeek(
  periods: readonly LighterPeriod[],
  now: Date,
): LighterPeriod | null {
  return periods.find((period) => within(now.getTime(), period)) ?? null;
}

/** Start a Lighter week at `now`: the new period list and the `deloadUntil` to store. */
export function startLighterWeek(periods: readonly LighterPeriod[], now: Date) {
  const until = new Date(now.getTime() + LIGHTER_WEEK_DAYS * DAY_MS).toISOString();
  const kept = [...periods, { from: now.toISOString(), until }].slice(-LIGHTER_WEEKS_KEPT);
  return { deloadUntil: until, lighterWeeks: kept };
}

/** End the running Lighter week now: it stops counting from this moment. */
export function endLighterWeek(periods: readonly LighterPeriod[], now: Date) {
  const lighterWeeks = periods.map((period) =>
    within(now.getTime(), period) ? { ...period, until: now.toISOString() } : period,
  );
  return { deloadUntil: null, lighterWeeks };
}

/** Whether a Session started in a Lighter week: its loads are not a baseline for anything. */
export function inLighterWeek(startedAt: string, periods: readonly LighterPeriod[]): boolean {
  const instant = Date.parse(startedAt);
  return periods.some((period) => within(instant, period));
}

/** The Sessions that did not start in a Lighter week, in their order. */
export function outsideLighterWeeks<T extends { started_at: string }>(
  sessions: readonly T[],
  periods: readonly LighterPeriod[],
): T[] {
  return sessions.filter((session) => !inLighterWeek(session.started_at, periods));
}

/**
 * During a Lighter week about half of an exercise's planned sets are suggested and the rest are
 * optional: the first half (rounded up) of the non-warm-up sets stay suggested. Returns the
 * indexes of the optional ones; warm-ups are never optional.
 */
export function optionalSetIndexes(kinds: readonly string[]): Set<number> {
  const working = kinds.flatMap((kind, index) => (kind === "warmup" ? [] : [index]));
  return new Set(working.slice(Math.ceil(working.length / 2)));
}
