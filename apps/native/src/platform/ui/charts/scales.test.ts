import { describe, expect, it } from "vitest";
import {
  MAX_GRIDLINES,
  TIME_STEPS,
  aggregateByWeek,
  dataTicks,
  labelledTicks,
  nearestIndex,
  rangePoints,
  scale,
  ticks,
} from "./scales";

describe("chart scales", () => {
  it("centres a single date and maps ordinary domains", () => {
    expect(scale(10, [10, 10], 200)).toBe(100);
    expect(scale(15, [10, 20], 200)).toBe(100);
    expect(scale(20, [10, 20], 200)).toBe(200);
  });
  it("keeps zero baselines with readable tick spacing", () => {
    expect(ticks([])).toEqual([0, 1]);
    expect(ticks([0, 0])).toEqual([0, 1]);
    expect(ticks([1, 1, 0])).toEqual([0, 1]);
    expect(ticks([3])).toEqual([0, 1, 2, 3]);
    expect(ticks([99, 12])).toEqual([0, 50, 100]);
    expect(ticks([7])).toEqual([0, 5, 10]);
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

describe("gridlines", () => {
  it("never draws more than four", () => {
    for (const max of [0, 1, 3, 4, 7, 10.5, 99, 100, 240, 1234, 56789]) {
      expect(ticks([max]).length, `ticks ${max}`).toBeLessThanOrEqual(MAX_GRIDLINES);
    }
    for (const [min, max] of [
      [60, 61],
      [72.4, 75.1],
      [299, 399],
      [1200, 9999],
    ] as const) {
      expect(dataTicks([min, max]).length, `data ${min}-${max}`).toBeLessThanOrEqual(MAX_GRIDLINES);
    }
  });

  it("brackets the data with round ticks that do not start at zero", () => {
    expect(dataTicks([72.4, 75.1])).toEqual([72, 74, 76]);
    expect(dataTicks([299, 399])).toEqual([250, 300, 350, 400]);
    expect(dataTicks([5])).toEqual([4.5, 5, 5.5]);
    expect(dataTicks([])).toEqual([0, 1]);
  });

  it("uses time-friendly steps for durations and paces", () => {
    expect(dataTicks([310, 395], TIME_STEPS)).toEqual([300, 360, 420]);
    expect(dataTicks([2400, 3300], TIME_STEPS)).toEqual([2400, 2700, 3000, 3300]);
  });
});

describe("aggregateByWeek", () => {
  const monday = Date.parse("2026-11-02T10:00:00Z");
  const day = 24 * 60 * 60 * 1000;
  const point = (n: number, y: number) => ({
    id: `s${n}`,
    x: monday + n * day,
    y,
    label: `d${n}`,
  });

  it("keeps one point per Monday-start week with the last session's date", () => {
    // Mon, Wed and Sun of one week, then Monday of the next.
    const week = aggregateByWeek([point(0, 5), point(2, 9), point(6, 7), point(7, 3)], "max");
    expect(week).toEqual([{ id: "s6", x: point(6, 0).x, y: 9, label: "d6" }, point(7, 3)]);
  });

  it("sums totals and keeps the lowest of a week for lower-is-better series", () => {
    const points = [point(0, 5), point(2, 9), point(8, 4)];
    expect(aggregateByWeek(points, "sum").map((p) => p.y)).toEqual([14, 4]);
    expect(aggregateByWeek(points, "min").map((p) => p.y)).toEqual([5, 4]);
  });

  it("handles no points", () => {
    expect(aggregateByWeek([], "max")).toEqual([]);
  });
});
