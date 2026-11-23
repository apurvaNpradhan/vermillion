import type { StartEditProblem } from "@workspace/shared";

/** The earliest moment a ticked set was completed, or null before the first tick. */
export function firstTickedAt(session: {
  exercises: readonly { sets: readonly { completedAt: string | null }[] }[];
}): string | null {
  let first: number | null = null;
  for (const exercise of session.exercises) {
    for (const set of exercise.sets) {
      if (set.completedAt === null) continue;
      const at = Date.parse(set.completedAt);
      if (!Number.isNaN(at) && (first === null || at < first)) first = at;
    }
  }
  return first === null ? null : new Date(first).toISOString();
}

/**
 * The latest start the editor offers: now, and no later than the first ticked set or the start
 * of the current pause (the same limits the write enforces).
 */
export function latestStartMs(input: {
  nowMs: number;
  firstTickedAt: string | null;
  pausedAt: string | null;
}): number {
  const limits = [input.nowMs];
  for (const value of [input.firstTickedAt, input.pausedAt]) {
    const at = value === null ? Number.NaN : Date.parse(value);
    if (!Number.isNaN(at)) limits.push(at);
  }
  return Math.min(...limits);
}

/** The translation key that explains why a start time was refused. */
export const START_PROBLEM_KEYS = {
  future: "session__clock_start_future",
  "after-tick": "session__clock_start_after_tick",
  "after-pause": "session__clock_start_after_pause",
  invalid: "session__clock_start_invalid",
  "too-old": "session__clock_start_invalid",
} as const satisfies Record<StartEditProblem, string>;
