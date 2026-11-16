import { describe, expect, it } from "vitest";

import { calendarDay, ratioChange, trailingDays, weekCells, weekStart } from "./home-stats";

const NOW = new Date("2026-11-18T12:00:00Z"); // a Wednesday

describe("weekCells", () => {
  it("runs Monday to Sunday and marks trained days and today", () => {
    const cells = weekCells(["2026-11-16T07:00:00Z", "2026-11-18T09:00:00Z"], NOW, "UTC");
    expect(cells.map((cell) => cell.trained)).toEqual([
      true,
      false,
      true,
      false,
      false,
      false,
      false,
    ]);
    expect(cells.map((cell) => cell.today)).toEqual([
      false,
      false,
      true,
      false,
      false,
      false,
      false,
    ]);
    expect(new Date(cells[0]?.day ?? 0).toISOString().slice(0, 10)).toBe("2026-11-16");
  });

  it("uses the user's zone for the day a Session started on", () => {
    // 23:30 UTC Sunday is already Monday in Auckland.
    const cells = weekCells(["2026-11-15T23:30:00Z"], NOW, "Pacific/Auckland");
    expect(cells[0]?.trained).toBe(true);
  });

  it("ignores Sessions of other weeks", () => {
    expect(weekCells(["2026-11-09T09:00:00Z"], NOW, "UTC").some((cell) => cell.trained)).toBe(
      false,
    );
  });
});

describe("trailingDays", () => {
  it("ends today, oldest first", () => {
    const days = trailingDays(["2026-11-18T09:00:00Z", "2026-11-16T09:00:00Z"], NOW, "UTC", 5);
    expect(days).toEqual([false, false, true, false, true]);
  });
});

describe("weekStart", () => {
  it("is the Monday of the week, also for a Sunday", () => {
    const sunday = calendarDay(new Date("2026-11-22T12:00:00Z"), "UTC");
    expect(new Date(weekStart(sunday)).toISOString().slice(0, 10)).toBe("2026-11-16");
  });
});

describe("ratioChange", () => {
  it("is null when last week was zero", () => {
    expect(ratioChange(5, 0)).toBeNull();
  });
  it("is the relative change", () => {
    expect(ratioChange(106, 100)).toBeCloseTo(0.06);
    expect(ratioChange(50, 100)).toBeCloseTo(-0.5);
  });
});
