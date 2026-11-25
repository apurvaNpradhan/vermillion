import { v5 as uuidv5 } from "uuid";

/** The identity of a skipped or explicitly selected Slot in a Run. */
export type RunSlot = { runId: string; slotId: string; cycle: number };
export type SlotSkip = Pick<RunSlot, "slotId" | "cycle">;

// Part of the sync protocol. Every device must use this same namespace and tuple order.
const SLOT_SKIP_NAMESPACE = "17a15546-93cc-46d5-ae49-69dfad0b7c67";
export const slotSkipId = ({ runId, slotId, cycle }: RunSlot) =>
  uuidv5(`${runId.toLowerCase()}:${slotId.toLowerCase()}:${cycle}`, SLOT_SKIP_NAMESPACE);

type CycleSession = {
  id: string;
  workoutId: string | null;
  slotId?: string | null;
  cycle: number | null;
  startedAt: string;
  finishedAt: string | null;
  hasCountedSet: boolean;
};

/** Rotation order is supplied by the caller, sorted by position then id. Rest never blocks. */
export function cycleState(
  slots: readonly { id: string; workoutId: string | null }[],
  sessions: readonly CycleSession[],
  skips: readonly SlotSkip[] = [],
) {
  const work = slots.flatMap((slot) => (slot.workoutId === null ? [] : [slot]));
  const workIds = new Set(work.map(({ id }) => id));
  const byCycle = new Map<number, Set<string>>();
  for (const { slotId, cycle } of skips) {
    if (!workIds.has(slotId)) continue;
    const skipped = byCycle.get(cycle) ?? new Set<string>();
    skipped.add(slotId);
    byCycle.set(cycle, skipped);
  }
  const counted = sessions
    .filter((item) => item.finishedAt !== null && item.hasCountedSet)
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt) || a.id.localeCompare(b.id));
  let latestCountedCycle = 1;
  const history = new Map<number, CycleSession[]>();
  for (const item of counted) {
    const cycle = item.cycle ?? latestCountedCycle;
    latestCountedCycle = Math.max(latestCountedCycle, cycle);
    const current = history.get(cycle) ?? [];
    current.push(item);
    history.set(cycle, current);
  }

  let cycle = latestCountedCycle;
  const skipped = new Set(byCycle.get(cycle) ?? []);
  const trained = new Set(skipped);
  const current = history.get(cycle) ?? [];
  // Reserve recorded slots before assigning legacy sessions. An exact match can override a skip.
  for (const item of current) {
    if (item.slotId != null && workIds.has(item.slotId)) {
      trained.add(item.slotId);
      skipped.delete(item.slotId);
    }
  }
  for (const item of current) {
    if (item.slotId != null || item.workoutId === null) continue;
    const slot = work.find((s) => s.workoutId === item.workoutId && !trained.has(s.id));
    if (slot) trained.add(slot.id);
  }
  const complete = work.length > 0 && trained.size === work.length;
  while (work.length > 0 && trained.size === work.length) {
    cycle += 1;
    trained.clear();
    skipped.clear();
    for (const id of byCycle.get(cycle) ?? []) {
      trained.add(id);
      skipped.add(id);
    }
  }
  return {
    cycle,
    latestCountedCycle,
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
