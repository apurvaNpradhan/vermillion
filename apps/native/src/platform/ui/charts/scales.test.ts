import { describe, expect, it } from "vitest";
import { labelledTicks, nearestIndex, rangePoints, scale, ticks } from "./scales";

describe("chart scales", () => {
  it("centres a single date and maps ordinary domains", () => {
    expect(scale(10, [10, 10], 200)).toBe(100);
    expect(scale(15, [10, 20], 200)).toBe(100);
    expect(scale(20, [10, 20], 200)).toBe(200);
  });
  it("keeps zero baselines with readable tick spacing", () => {
    expect(ticks([])).toEqual([0, 0.5, 1]);
    expect(ticks([0, 0])).toEqual([0, 0.5, 1]);
    expect(ticks([99, 12])).toEqual([0, 50, 100]);
    expect(ticks([0.3])).toEqual([0, 0.1, 0.2, 0.3]);
  });
  it("snaps to nearest point with deterministic ties and empty handling", () => {
    expect(nearestIndex([], 20)).toBe(-1);
    expect(nearestIndex([10], 500)).toBe(0);
    expect(nearestIndex([10, 30, 100], 65)).toBe(1);
    expect(nearestIndex([10, 30, 100], 90)).toBe(2);
  });
  it("uses calendar ranges and retains all history on All", () => {
    const points = ["2025-12-01", "2026-07-01", "2026-10-01"].map((date) => ({
      id: date,
      x: Date.parse(date),
      y: 1,
      label: date,
    }));
    expect(rangePoints(points, "3M", Date.parse("2026-11-10"))).toEqual([points[2]]);
    expect(rangePoints(points, "1Y", Date.parse("2026-11-10"))).toEqual(points);
    expect(rangePoints(points, "All", Date.parse("2026-11-10"))).toEqual(points);
    const monthEnd = [{ id: "feb", x: Date.parse("2026-02-28"), y: 1, label: "Feb" }];
    expect(rangePoints(monthEnd, "3M", Date.parse("2026-05-31"))).toEqual(monthEnd);
  });
});

it("does not repeat rounded axis labels for zero and single-point series", () => {
  for (const values of [[0], [0, 0], [0.1]]) {
    const grid = labelledTicks(ticks(values), (value) => String(Math.round(value)));
    expect(new Set(grid.map((value) => String(Math.round(value)))).size).toBe(grid.length);
  }
});
