/** What a duration set's timer needs. */
export type TimerSet = {
  timerStartedAt: string | null;
  completedAt: string | null;
  /** The value typed into the cell, if any. */
  durationS: number | null;
  target: { duration_s?: number } | null;
};

/**
 * What a countdown counts down from: the duration typed into the cell, else the planned target.
 * Null means there is none, and the timer is a stopwatch.
 */
export function timerTarget(set: Pick<TimerSet, "durationS" | "target">): number | null {
  return set.durationS ?? set.target?.duration_s ?? null;
}

export type TimerView = {
  /** Whole seconds since the timer started; never negative, even if the clock was set back. */
  elapsed: number;
  /** Seconds left of a countdown; null for a stopwatch. */
  remaining: number | null;
  /** A countdown that has reached zero: it ticks the set. */
  due: boolean;
};

/**
 * A running timer from its stored start, so it is right after the app was backgrounded or killed.
 * A countdown is due once `target` seconds have passed.
 */
export function timerView(startedAt: string, target: number | null, now: number): TimerView {
  const started = Date.parse(startedAt);
  const elapsed = Number.isNaN(started) ? 0 : Math.max(0, Math.floor((now - started) / 1000));
  if (target === null) return { elapsed, remaining: null, due: false };
  const remaining = Math.max(0, target - elapsed);
  return { elapsed, remaining, due: remaining === 0 };
}

/**
 * The timers that have run out: unticked sets with a running countdown at zero, with the duration
 * to log (the target). A stopwatch never ends by itself.
 */
export function dueTimers<S extends TimerSet & { id: string }>(
  sets: readonly S[],
  now: number,
): { id: string; duration: number }[] {
  return sets.flatMap((set) => {
    if (set.timerStartedAt === null || set.completedAt !== null) return [];
    const target = timerTarget(set);
    if (target === null) return [];
    return timerView(set.timerStartedAt, target, now).due ? [{ id: set.id, duration: target }] : [];
  });
}
