import { describe, expect, it } from "vitest";

import {
  inMonth,
  localDate,
  monthCells,
  monthOf,
  monthQueryRange,
  shiftMonth,
} from "./history-calendar";

describe("monthCells", () => {
  it("starts on a Monday with blanks before the 1st and one cell per day", () => {
    // 1 November 2026 is a Sunday: six blanks.
    const cells = monthCells({ year: 2026, month: 10 }, new Map([["2026-11-16", 2]]), "monday");
    expect(cells.filter((cell) => cell.kind === "blank")).toHaveLength(6);
    const days = cells.flatMap((cell) => (cell.kind === "day" ? [cell] : []));
    expect(days).toHaveLength(30);
    expect(days.find((cell) => cell.day === 16)?.sessions).toBe(2);
    expect(days.find((cell) => cell.day === 17)?.sessions).toBe(0);
  });

  it("has no blanks when the 1st is a Monday", () => {
    const cells = monthCells({ year: 2027, month: 1 }, new Map(), "monday"); // 1 Feb 2027
    expect(cells.some((cell) => cell.kind === "blank")).toBe(false);
    expect(cells).toHaveLength(28);
  });

  it("counts the 29th of a leap February", () => {
    const cells = monthCells({ year: 2028, month: 1 }, new Map(), "monday");
    expect(cells.filter((cell) => cell.kind === "day")).toHaveLength(29);
    expect(cells.filter((cell) => cell.kind === "blank")).toHaveLength(1); // a Tuesday
  });
});

describe("monthCells for other week starts", () => {
  const blanks = (weekStart: "monday" | "sunday" | "saturday") =>
    monthCells({ year: 2026, month: 10 }, new Map(), weekStart).filter(
      (cell) => cell.kind === "blank",
    ).length;
  it("puts the 1st (a Sunday) in the first column when weeks start on Sunday", () => {
    expect(blanks("sunday")).toBe(0);
  });
  it("leaves one blank when weeks start on Saturday", () => {
    expect(blanks("saturday")).toBe(1);
  });
});

describe("shiftMonth", () => {
  it("crosses year boundaries", () => {
    expect(shiftMonth({ year: 2026, month: 0 }, -1)).toEqual({ year: 2025, month: 11 });
    expect(shiftMonth({ year: 2026, month: 11 }, 1)).toEqual({ year: 2027, month: 0 });
  });
});

describe("zones", () => {
  it("uses the user's zone for the day and the month", () => {
    expect(localDate("2026-10-31T23:30:00Z", "Pacific/Auckland")).toBe("2026-11-01");
    expect(monthOf("2026-10-31T23:30:00Z", "Pacific/Auckland")).toEqual({ year: 2026, month: 10 });
    expect(inMonth("2026-10-31T23:30:00Z", { year: 2026, month: 9 }, "UTC")).toBe(true);
  });

  it("queries a range wide enough for every zone", () => {
    const { from, to } = monthQueryRange({ year: 2026, month: 10 });
    expect(from <= "2026-10-31T00:00:00.000Z").toBe(true);
    expect(to >= "2026-12-01T23:59:59.000Z").toBe(true);
  });
});
