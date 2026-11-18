import { describe, expect, it } from "vitest";

import {
  cellAtPoint,
  dayCellAtPoint,
  deriveLevels,
  heatmapColumns,
  heatmapLevel,
  levelOpacity,
  monthStarts,
  readableDays,
  stepReadout,
} from "./heatmap-chart-math";

const DAY = 86_400_000;
// Wednesday 18 Nov 2026.
const today = Date.UTC(2026, 10, 18);
const monday = Date.UTC(2026, 10, 16);

describe("heatmapColumns", () => {
  const columns = heatmapColumns({
    counts: new Map([
      [today, 12],
      [monday - 7 * DAY, 3],
    ]),
    end: today,
    weeks: 26,
    weekStart: "monday",
  });

  it("makes whole weeks that end in the current one", () => {
    expect(columns).toHaveLength(26);
    expect(columns.every((column) => column.bins.length === 7)).toBe(true);
    expect(columns.at(-1)?.bins[0]?.day).toBe(monday);
  });
  it("starts the first column 25 weeks back", () => {
    expect(columns[0]?.bins[0]?.day).toBe(monday - 25 * 7 * DAY);
  });
  it("buckets counts onto their day and leaves the rest at zero", () => {
    expect(columns.at(-1)?.bins[2]).toMatchObject({ day: today, count: 12, inRange: true });
    expect(columns.at(-2)?.bins[0]?.count).toBe(3);
    expect(columns.at(-3)?.bins.every((bin) => bin.count === 0)).toBe(true);
  });
  it("marks the days after today as not yet happened", () => {
    expect(columns.at(-1)?.bins.map((bin) => bin.inRange)).toEqual([
      true,
      true,
      true,
      false,
      false,
      false,
      false,
    ]);
  });
  it("follows the week start", () => {
    const sunday = heatmapColumns({ counts: new Map(), end: today, weeks: 1, weekStart: "sunday" });
    expect(sunday[0]?.bins[0]?.day).toBe(monday - DAY);
  });
});

describe("levels", () => {
  it("defaults to a plain ramp when nothing was counted", () => {
    expect(deriveLevels([])).toEqual([1, 2, 3, 4]);
  });
  it("derives thresholds from the non-zero quartiles", () => {
    const columns = heatmapColumns({
      counts: new Map([1, 2, 3, 4, 5, 6, 7, 8].map((n) => [today - n * DAY, n * 4])),
      end: today,
      weeks: 2,
      weekStart: "monday",
    });
    const levels = deriveLevels(columns);
    expect(levels).toHaveLength(4);
    expect(levels[0]).toBe(1);
    expect(levels).toEqual([...levels].sort((a, b) => a - b));
  });
  it("keeps tied thresholds apart", () => {
    const columns = heatmapColumns({
      counts: new Map([[today, 5]]),
      end: today,
      weeks: 1,
      weekStart: "monday",
    });
    expect(deriveLevels(columns)).toEqual([1, 5, 6, 7]);
  });
  it("maps a count to its level", () => {
    expect(heatmapLevel(0, [1, 5, 9, 13])).toBe(0);
    expect(heatmapLevel(1, [1, 5, 9, 13])).toBe(1);
    expect(heatmapLevel(9, [1, 5, 9, 13])).toBe(3);
    expect(heatmapLevel(99, [1, 5, 9, 13])).toBe(4);
  });
  it("supports two levels: done or not", () => {
    expect(heatmapLevel(1, [1])).toBe(1);
    expect(heatmapLevel(0, [1])).toBe(0);
    expect(levelOpacity(1, 1)).toBe(1);
  });
  it("draws the lowest level fainter than the highest", () => {
    expect(levelOpacity(0, 4)).toBe(0);
    expect(levelOpacity(1, 4)).toBeCloseTo(0.3);
    expect(levelOpacity(4, 4)).toBeCloseTo(1);
  });
});

describe("cellAtPoint", () => {
  it("finds the cell under a point", () => {
    expect(cellAtPoint(0, 0, 10, 2, 26)).toEqual({ column: 0, row: 0 });
    expect(cellAtPoint(25, 13, 10, 2, 26)).toEqual({ column: 2, row: 1 });
  });
  it("is null outside the grid", () => {
    expect(cellAtPoint(-1, 0, 10, 2, 26)).toBeNull();
    expect(cellAtPoint(26 * 12, 0, 10, 2, 26)).toBeNull();
    expect(cellAtPoint(0, 7 * 12, 10, 2, 26)).toBeNull();
  });
  it("is null in the gap between cells", () => {
    expect(cellAtPoint(11, 0, 10, 2, 26)).toBeNull();
    expect(cellAtPoint(5, 10.5, 10, 2, 26)).toBeNull();
    expect(cellAtPoint(12, 0, 10, 2, 26)).toEqual({ column: 1, row: 0 });
  });
});

describe("dayCellAtPoint", () => {
  const columns = heatmapColumns({ counts: new Map(), end: today, weeks: 2, weekStart: "monday" });
  it("finds a day that has happened", () => {
    // Monday the 16th: second column, first row.
    expect(dayCellAtPoint(columns, 12, 0, 10, 2)).toEqual({ column: 1, row: 0 });
  });
  it("ignores a day after today and a gap", () => {
    // The second column's Thursday (row 3) is after Wednesday the 18th.
    expect(dayCellAtPoint(columns, 12, 3 * 12, 10, 2)).toBeNull();
    expect(dayCellAtPoint(columns, 11, 0, 10, 2)).toBeNull();
  });
});

describe("readableDays and stepReadout", () => {
  const columns = heatmapColumns({ counts: new Map(), end: today, weeks: 2, weekStart: "monday" });
  it("lists only the days that have happened, oldest first", () => {
    const days = readableDays(columns);
    expect(days).toHaveLength(7 + 3);
    expect(days.at(-1)?.day).toBe(today);
    expect(days[0]?.day).toBe(monday - 7 * DAY);
  });
  it("starts on the latest day and stays inside the list", () => {
    expect(stepReadout(10, null, -1)).toBe(9);
    expect(stepReadout(10, null, 1)).toBe(9);
    expect(stepReadout(10, 9, 1)).toBe(9);
    expect(stepReadout(10, 0, -1)).toBe(0);
    expect(stepReadout(10, 4, 1)).toBe(5);
    expect(stepReadout(0, null, 1)).toBe(0);
  });
});

describe("monthStarts", () => {
  it("labels the column where each month begins", () => {
    const columns = heatmapColumns({
      counts: new Map(),
      end: today,
      weeks: 26,
      weekStart: "monday",
    });
    const starts = monthStarts(columns);
    expect(starts[0]?.column).toBe(0);
    expect(starts.length).toBeGreaterThanOrEqual(6);
    expect(new Set(starts.map((start) => new Date(start.day).getUTCMonth())).size).toBe(
      starts.length,
    );
  });
});
