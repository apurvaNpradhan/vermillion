/** A Slot deliberately left out of one Cycle ("Skip this cycle"). */
export type SlotSkip = { slotId: string; cycle: number };

/**
 * Rotation order is supplied by the caller, sorted by position then id. Rest never blocks.
 * A skipped Slot counts as done for its Cycle (in `trained`, and also in `skipped` so a screen can
 * tell it from a trained one); the Program order is never changed. Skips of other Cycles, of
 * Rest Slots and of Slots no longer in the Rotation are ignored.
 */
export function cycleState(
  slots: readonly { id: string; workoutId: string | null }[],
  sessions: readonly {
    id: string;
    workoutId: string | null;
    cycle: number | null;
    startedAt: string;
    finishedAt: string | null;
    hasCountedSet: boolean;
  }[],
  skips: readonly SlotSkip[] = [],
) {
  const trained = new Set<string>();
  const skipped = new Set<string>();
  let cycle = 1;
  const work = slots.flatMap((slot) => (slot.workoutId === null ? [] : [slot]));
  /** Starts tracking `next`: nothing is trained yet but what was skipped for that Cycle. */
  const enter = (next: number) => {
    cycle = next;
    trained.clear();
    skipped.clear();
    for (const skip of skips) {
      if (skip.cycle !== cycle || !work.some((slot) => slot.id === skip.slotId)) continue;
      trained.add(skip.slotId);
      skipped.add(skip.slotId);
    }
  };
  enter(1);
  const ordered = [...sessions].sort(
    (a, b) => a.startedAt.localeCompare(b.startedAt) || a.id.localeCompare(b.id),
  );
  for (const session of ordered) {
    if (!session.finishedAt || !session.hasCountedSet || session.workoutId === null) continue;
    if ((session.cycle ?? cycle) > cycle) enter(session.cycle ?? cycle);
    if ((session.cycle ?? cycle) < cycle) continue;
    const slot = slots.find((s) => s.workoutId === session.workoutId && !trained.has(s.id));
    if (slot) trained.add(slot.id);
  }
  const complete = work.length > 0 && work.every((slot) => trained.has(slot.id));
  if (complete) enter(cycle + 1);
  return {
    cycle,
    trained,
    skipped,
    complete,
    next: work.find((slot) => !trained.has(slot.id)) ?? null,
  };
}

/** Calendar days in the user's zone avoid DST's 23/25-hour days changing the week. */
export function runWeek(startedAt: string | null, now: Date, timezone: string): number {
  if (startedAt === null) return 1;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const day = (date: Date) => {
    const parts = formatter.formatToParts(date);
    const part = (name: string) => Number(parts.find((p) => p.type === name)?.value);
    return Date.UTC(part("year"), part("month") - 1, part("day"));
  };
  return Math.max(1, Math.floor((day(now) - day(new Date(startedAt))) / 604800000) + 1);
}

/** Offline activations converge by activation time, with id breaking equal-time ties. */
export function activeRun<
  T extends { id: string; activated_at: string; finished_at: string | null },
>(runs: readonly T[]): T | null {
  return (
    [...runs]
      .sort((a, b) => b.activated_at.localeCompare(a.activated_at) || b.id.localeCompare(a.id))
      .find((run) => run.finished_at === null) ?? null
  );
}
