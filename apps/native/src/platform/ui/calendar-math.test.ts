import { describe, expect, it } from "vitest";

import { calendarGrid, calendarMonth, calendarPage } from "./calendar-math";

describe("calendar month", () => {
  const november = Date.UTC(2026, 10, 1);

  it("keeps six rows and rotates them to the preferred week start", () => {
    const monday = calendarGrid(november, "monday");
    expect(monday).toHaveLength(6);
    expect(monday[0]).toHaveLength(7);
    expect(monday[0]?.[0]).toBe(Date.UTC(2026, 9, 26));
    expect(monday[0]?.[6]).toBe(november);
    expect(calendarGrid(november, "sunday")[0]?.[0]).toBe(november);
  });

  it("pages by month through years and does not overflow from a 31st", () => {
    expect(calendarMonth(Date.UTC(2026, 11, 31), 1)).toBe(Date.UTC(2027, 0, 1));
    expect(calendarMonth(Date.UTC(2028, 0, 31), 1)).toBe(Date.UTC(2028, 1, 1));
    expect(calendarGrid(Date.UTC(2028, 1, 1), "saturday").flat()).toContain(Date.UTC(2028, 1, 29));
  });

  it("pages into partial boundary months and stops at either bound", () => {
    const min = Date.UTC(2026, 9, 28);
    const max = Date.UTC(2026, 10, 3);
    expect(calendarPage(november, -1, min, max)).toBe(Date.UTC(2026, 9, 1));
    expect(calendarPage(november, 1, min, max)).toBeNull();
    expect(calendarPage(Date.UTC(2026, 9, 1), -1, min, max)).toBeNull();
  });
});
