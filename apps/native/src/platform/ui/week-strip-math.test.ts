import { describe, expect, it } from "vitest";

import { plannedDay, stripDays } from "./week-strip-math";

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
