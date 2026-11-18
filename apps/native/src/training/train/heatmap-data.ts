import { calendarDay, isCounted, type LoggedSet } from "@workspace/shared";

/** How many weeks the Train heatmap shows. */
export const HEATMAP_WEEKS = 26;

/** Counted sets per calendar day (in `timezone`) over the Sessions that started on it. */
export function setsByDay(
  sessions: readonly { started_at: string; sets: readonly LoggedSet[] }[],
  timezone: string,
): Map<number, number> {
  const counts = new Map<number, number>();
  for (const session of sessions) {
    const sets = session.sets.filter(isCounted).length;
    if (sets === 0) continue;
    const day = calendarDay(session.started_at, timezone);
    counts.set(day, (counts.get(day) ?? 0) + sets);
  }
  return counts;
}

/** The totals the heatmap's summary reads out. */
export function heatmapTotals(counts: ReadonlyMap<number, number>, since: number) {
  let sets = 0;
  let days = 0;
  for (const [day, count] of counts) {
    if (day < since) continue;
    sets += count;
    days += 1;
  }
  return { sets, days };
}
