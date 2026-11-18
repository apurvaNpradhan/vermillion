import { describe, expect, it } from "vitest";

import { heatmapColumns } from "../../platform/ui/heatmap-chart-math";

import { heatmapTotals, setsByDay } from "./heatmap-data";

describe("setsByDay", () => {
  it("adds the Sessions of one day and buckets by the user's zone", () => {
    const counts = setsByDay(
      [
        { started_at: "2026-11-18T01:00:00Z", sets: 1 },
        { started_at: "2026-11-18T08:00:00Z", sets: 1 },
        { started_at: "2026-11-18T23:00:00Z", sets: 4 },
      ],
      "Asia/Kolkata",
    );
    // 23:00 UTC is already the 19th in Kolkata.
    expect([...counts.values()].toSorted()).toEqual([2, 4]);
  });
  it("leaves a Session with no counted sets out", () => {
    expect(setsByDay([{ started_at: "2026-11-18T09:00:00Z", sets: 0 }], "UTC").size).toBe(0);
  });
});

describe("heatmapTotals", () => {
  const day = (value: string) => Date.parse(`${value}T00:00:00Z`);
  const today = day("2026-11-18");
  it("sums only the in-range bins the chart draws", () => {
    const counts = new Map([
      [day("2026-11-10"), 5],
      [day("2026-11-17"), 7],
      // A future day (a clock ahead, a Session dated tomorrow) and a day before the grid.
      [day("2026-11-19"), 9],
      [day("2025-01-01"), 3],
    ]);
    const columns = heatmapColumns({ counts, end: today, weeks: 4, weekStart: "monday" });
    expect(heatmapTotals(columns)).toEqual({ sets: 12, days: 2 });
  });
  it("is empty with no training", () => {
    const columns = heatmapColumns({
      counts: new Map(),
      end: today,
      weeks: 4,
      weekStart: "monday",
    });
    expect(heatmapTotals(columns)).toEqual({ sets: 0, days: 0 });
  });
});
