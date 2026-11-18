import { calendarDay } from "@workspace/shared";

import type { HeatmapColumn } from "@/platform/ui/heatmap-chart-math";

/** How many weeks the Train heatmap shows. */
export const HEATMAP_WEEKS = 26;

/** Counted sets per calendar day (in `timezone`) over the Sessions that started on it. */
export function setsByDay(
  sessions: readonly { started_at: string; sets: number }[],
  timezone: string,
): Map<number, number> {
  const counts = new Map<number, number>();
  for (const session of sessions) {
    if (session.sets <= 0) continue;
    const day = calendarDay(session.started_at, timezone);
    counts.set(day, (counts.get(day) ?? 0) + session.sets);
  }
  return counts;
}

/**
 * The totals the heatmap's summary reads out, from the bins the chart draws: days after today
 * and days outside the grid are not in them, so the summary always agrees with the picture.
 */
export function heatmapTotals(columns: readonly HeatmapColumn[]) {
  let sets = 0;
  let days = 0;
  for (const column of columns) {
    for (const bin of column.bins) {
      if (!bin.inRange || bin.count <= 0) continue;
      sets += bin.count;
      days += 1;
    }
  }
  return { sets, days };
}
