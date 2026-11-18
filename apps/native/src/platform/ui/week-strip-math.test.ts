import { describe, expect, it } from "vitest";

import { columnOffset, columnWidth, plannedDay, stripDays } from "./week-strip-math";

const DAY = 86_400_000;
const monday = Date.UTC(2026, 10, 16);

describe("stripDays", () => {
  it("lists seven consecutive days", () => {
    const days = stripDays(monday);
    expect(days).toHaveLength(7);
    expect(days[6]).toBe(monday + 6 * DAY);
  });
});

describe("plannedDay", () => {
  const days = stripDays(monday);
  it("is today until today is trained", () => {
    expect(plannedDay(days, new Set(), monday + 2 * DAY)).toBe(monday + 2 * DAY);
  });
  it("moves to the next day once today is trained", () => {
    const today = monday + 2 * DAY;
    expect(plannedDay(days, new Set([today]), today)).toBe(today + DAY);
  });
  it("is null when the week has no later day", () => {
    const today = monday + 6 * DAY;
    expect(plannedDay(days, new Set([today]), today)).toBeNull();
  });
});

describe("columnOffset", () => {
  it("places equal columns with gaps", () => {
    // 7 columns, 4pt gaps, 340pt wide: (340 - 24) / 7 each.
    expect(columnWidth(7, 340, 4)).toBeCloseTo(45.142857, 5);
    expect(columnOffset(0, 7, 340, 4)).toBe(0);
    expect(columnOffset(1, 7, 340, 4)).toBeCloseTo(49.142857, 5);
    expect(columnOffset(6, 7, 340, 4)).toBeCloseTo(340 - columnWidth(7, 340, 4), 5);
  });

  it("is zero before the row has a width or for a missing day", () => {
    expect(columnOffset(3, 7, 0, 4)).toBe(0);
    expect(columnOffset(-1, 7, 340, 4)).toBe(0);
    expect(columnWidth(0, 340, 4)).toBe(0);
  });
});
