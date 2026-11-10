/** Rotation order is supplied by the caller, sorted by position then id. Rest never blocks. */
export function cycleState(
  slots: readonly { id: string; workoutId: string | null }[],
  sessions: readonly {
    id: string;
    workoutId: string | null;
    cycle: number | null;
    startedAt: string;
    finishedAt: string | null;
  }[],
) {
  const trained = new Set<string>();
  let cycle = 1;
  const ordered = [...sessions].sort(
    (a, b) => a.startedAt.localeCompare(b.startedAt) || a.id.localeCompare(b.id),
  );
  for (const session of ordered) {
    if (!session.finishedAt || session.workoutId === null) continue;
    if ((session.cycle ?? cycle) > cycle) {
      cycle = session.cycle ?? cycle;
      trained.clear();
    }
    if ((session.cycle ?? cycle) < cycle) continue;
    const slot = slots.find((s) => s.workoutId === session.workoutId && !trained.has(s.id));
    if (slot) trained.add(slot.id);
  }
  const work = slots.flatMap((slot) => (slot.workoutId === null ? [] : [slot]));
  const complete = work.length > 0 && work.every((slot) => trained.has(slot.id));
  if (complete) {
    cycle += 1;
    trained.clear();
  }
  return {
    cycle,
    trained,
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
