import { describe, expect, it } from "vitest";

import { ratioChange, sessionsInWeek, trailingDays, weekCells, weighInsInWeek } from "./home-stats";

const NOW = new Date("2026-11-18T12:00:00Z"); // a Wednesday

describe("weekCells", () => {
  it("runs Monday to Sunday and marks trained days and today", () => {
    const cells = weekCells(["2026-11-16T07:00:00Z", "2026-11-18T09:00:00Z"], NOW, "UTC", "monday");
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
    const cells = weekCells(["2026-11-15T23:30:00Z"], NOW, "Pacific/Auckland", "monday");
    expect(cells[0]?.trained).toBe(true);
  });

  it("ignores Sessions of other weeks", () => {
    expect(
      weekCells(["2026-11-09T09:00:00Z"], NOW, "UTC", "monday").some((cell) => cell.trained),
    ).toBe(false);
  });
});

describe("trailingDays", () => {
  it("ends today, oldest first", () => {
    const days = trailingDays(["2026-11-18T09:00:00Z", "2026-11-16T09:00:00Z"], NOW, "UTC", 5);
    expect(days).toEqual([false, false, true, false, true]);
  });
});

describe("a week that starts on another day", () => {
  it("runs Sunday to Saturday", () => {
    const cells = weekCells(["2026-11-15T09:00:00Z", "2026-11-21T09:00:00Z"], NOW, "UTC", "sunday");
    expect(new Date(cells[0]?.day ?? 0).toISOString().slice(0, 10)).toBe("2026-11-15");
    expect(cells.map((cell) => cell.trained)).toEqual([
      true,
      false,
      false,
      false,
      false,
      false,
      true,
    ]);
  });

  it("runs Saturday to Friday and puts a Saturday in the new week", () => {
    const cells = weekCells(["2026-11-14T09:00:00Z"], NOW, "UTC", "saturday");
    expect(new Date(cells[0]?.day ?? 0).toISOString().slice(0, 10)).toBe("2026-11-14");
    expect(cells[0]?.trained).toBe(true);
  });
});

describe("sessionsInWeek", () => {
  const sessions = [
    { started_at: "2026-11-15T09:00:00Z" },
    { started_at: "2026-11-16T09:00:00Z" },
    { started_at: "2026-11-10T09:00:00Z" },
  ];
  it("keeps Sessions of this week or of an earlier one", () => {
    expect(sessionsInWeek(sessions, NOW, "UTC", "monday")).toHaveLength(1);
    expect(sessionsInWeek(sessions, NOW, "UTC", "monday", 1)).toHaveLength(2);
    // With Sunday first the Sunday Session belongs to this week.
    expect(sessionsInWeek(sessions, NOW, "UTC", "sunday")).toHaveLength(2);
  });
});

describe("weighInsInWeek", () => {
  const days = [
    { date: "2026-11-14", logged: true },
    { date: "2026-11-15", logged: true },
    { date: "2026-11-16", logged: true },
    { date: "2026-11-17", logged: false },
    { date: "2026-11-18", logged: true },
  ];
  it("counts logged days since the week started, not the last seven", () => {
    expect(weighInsInWeek(days, NOW, "UTC", "monday")).toBe(2);
    expect(weighInsInWeek(days, NOW, "UTC", "sunday")).toBe(3);
    expect(weighInsInWeek(days, NOW, "UTC", "saturday")).toBe(4);
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
