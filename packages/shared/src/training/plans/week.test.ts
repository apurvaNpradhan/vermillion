import { describe, expect, it } from "vitest";

import { weekColumn, weekDays, weekRange, weekStartDay, weekStartKey } from "./week";

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

describe("weekRange", () => {
  // 2026-11-18 is a Wednesday.
  it("starts on Monday, Sunday or Saturday", () => {
    const at = "2026-11-18T12:00:00Z";
    expect(iso(weekRange(at, "UTC", "monday").start)).toBe("2026-11-16");
    expect(iso(weekRange(at, "UTC", "sunday").start)).toBe("2026-11-15");
    expect(iso(weekRange(at, "UTC", "saturday").start)).toBe("2026-11-14");
  });

  it("ends at the first day of the next week", () => {
    const { start, end } = weekRange("2026-11-18T12:00:00Z", "UTC", "monday");
    expect(iso(end)).toBe("2026-11-23");
    expect(end - start).toBe(7 * 86_400_000);
  });

  it("keeps a day that is the start day in its own week", () => {
    expect(iso(weekRange("2026-11-16T00:30:00Z", "UTC", "monday").start)).toBe("2026-11-16");
    expect(iso(weekRange("2026-11-15T23:59:00Z", "UTC", "monday").start)).toBe("2026-11-09");
    expect(iso(weekRange("2026-11-15T10:00:00Z", "UTC", "sunday").start)).toBe("2026-11-15");
  });

  it("uses the calendar day in the user's zone", () => {
    // 23:30 UTC on Sunday is already Monday in Auckland.
    expect(iso(weekRange("2026-11-15T23:30:00Z", "Pacific/Auckland", "monday").start)).toBe(
      "2026-11-16",
    );
  });

  it("keeps seven calendar days across a DST change", () => {
    const { start, end } = weekRange("2026-11-01T12:00:00Z", "America/New_York", "sunday");
    expect(iso(start)).toBe("2026-11-01");
    expect(iso(end)).toBe("2026-11-08");
  });
});

describe("week helpers", () => {
  it("keys a week by its first day", () => {
    expect(weekStartKey("2026-11-18T12:00:00Z", "UTC", "saturday")).toBe("2026-11-14");
  });

  it("finds the first day of a day's week", () => {
    expect(iso(weekStartDay(Date.UTC(2026, 10, 14), "saturday"))).toBe("2026-11-14");
    expect(iso(weekStartDay(Date.UTC(2026, 10, 20), "saturday"))).toBe("2026-11-14");
  });

  it("lists the weekdays in column order", () => {
    expect(weekDays("monday")).toEqual([1, 2, 3, 4, 5, 6, 0]);
    expect(weekDays("sunday")).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(weekDays("saturday")).toEqual([6, 0, 1, 2, 3, 4, 5]);
  });

  it("places a weekday in its column", () => {
    expect(weekColumn(0, "monday")).toBe(6);
    expect(weekColumn(1, "monday")).toBe(0);
    expect(weekColumn(6, "saturday")).toBe(0);
    expect(weekColumn(5, "saturday")).toBe(6);
  });
});
