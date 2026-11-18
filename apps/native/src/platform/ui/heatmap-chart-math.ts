/**
 * Source: PanelUI HeatmapChart (panelui-native 1.4.0, MIT, https://panelui.dev).
 * Copyright (c) 2026 Khalid Abdi. See THIRD_PARTY_NOTICES.md.
 * `buildHeatmapCalendar`, `deriveLevels` and the cell lookup, ported to UTC calendar-day numbers
 * (so the caller's time zone decides what a day is) and pulled out of the component to be tested.
 */
import { weekStartDay, type WeekStart } from "@workspace/shared";

const DAY_MS = 86_400_000;
export const HEATMAP_ROWS = 7;

/** One day of a column: its row, its calendar day, its count, and whether it has happened. */
export type HeatmapBin = { row: number; day: number; count: number; inRange: boolean };
export type HeatmapColumn = { column: number; bins: HeatmapBin[] };

/**
 * `weeks` columns ending in the week of `end`, one row per weekday of the user's week. A day with
 * no entry is a bin with a count of 0, so the calendar has no holes; days after `end` exist but
 * are `inRange: false` and are not drawn.
 */
export function heatmapColumns(input: {
  counts: ReadonlyMap<number, number>;
  end: number;
  weeks: number;
  weekStart: WeekStart;
}): HeatmapColumn[] {
  const last = weekStartDay(input.end, input.weekStart);
  const first = last - (input.weeks - 1) * 7 * DAY_MS;
  return Array.from({ length: input.weeks }, (_, column) => ({
    column,
    bins: Array.from({ length: HEATMAP_ROWS }, (_, row) => {
      const day = first + (column * HEATMAP_ROWS + row) * DAY_MS;
      return { row, day, count: input.counts.get(day) ?? 0, inRange: day <= input.end };
    }),
  }));
}

/**
 * Four thresholds from the data's own quartiles of the non-zero counts, so a sparse chart and a
 * busy one both use the whole ramp. Ties are nudged apart so four levels stay four.
 */
export function deriveLevels(columns: readonly HeatmapColumn[]): number[] {
  const counts = columns
    .flatMap((column) => column.bins.map((bin) => bin.count))
    .filter((count) => count > 0)
    .sort((a, b) => a - b);
  if (counts.length === 0) return [1, 2, 3, 4];
  const at = (fraction: number) =>
    counts[Math.min(counts.length - 1, Math.floor(counts.length * fraction))] ?? 1;
  const thresholds = [1, at(0.25), at(0.5), at(0.75)];
  for (let index = 1; index < thresholds.length; index += 1) {
    const below = thresholds[index - 1] ?? 0;
    if ((thresholds[index] ?? 0) <= below) thresholds[index] = below + 1;
  }
  return thresholds;
}

/** 0 for nothing, then 1 up to `thresholds.length` for each threshold the count reaches. */
export function heatmapLevel(count: number, thresholds: readonly number[]): number {
  if (count <= 0) return 0;
  let level = 1;
  thresholds.forEach((threshold, index) => {
    if (count >= threshold) level = index + 1;
  });
  return level;
}

/** How opaque a level draws: the top level is solid, the lowest still reads against the track. */
export function levelOpacity(level: number, levels: number): number {
  if (level <= 0) return 0;
  if (levels <= 1) return 1;
  return 0.3 + (0.7 * (level - 1)) / (levels - 1);
}

/** The column and row under a point of the grid, or null in a gap or outside it. */
export function cellAtPoint(
  x: number,
  y: number,
  size: number,
  gap: number,
  columns: number,
  rows = HEATMAP_ROWS,
): { column: number; row: number } | null {
  const step = size + gap;
  if (step <= 0 || x < 0 || y < 0) return null;
  const column = Math.floor(x / step);
  const row = Math.floor(y / step);
  if (column >= columns || row >= rows) return null;
  return { column, row };
}

/** The columns whose first day starts a new month, to label under the grid. */
export function monthStarts(columns: readonly HeatmapColumn[]): { column: number; day: number }[] {
  let previous = -1;
  return columns.flatMap((column) => {
    const day = column.bins[0]?.day;
    if (day === undefined) return [];
    const month = new Date(day).getUTCMonth();
    if (month === previous) return [];
    previous = month;
    return [{ column: column.column, day }];
  });
}
