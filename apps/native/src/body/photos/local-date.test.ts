import { describe, expect, it } from "vitest";

import { formatCalendarDate, localDateIn } from "./local-date";

describe("local dates", () => {
  it("finds the calendar date an instant falls on in a zone", () => {
    const instant = new Date("2026-03-01T23:30:00Z");
    expect(localDateIn("UTC", instant)).toBe("2026-03-01");
    expect(localDateIn("Asia/Kolkata", instant)).toBe("2026-03-02");
    expect(localDateIn("America/Los_Angeles", instant)).toBe("2026-03-01");
  });

  it("formats a calendar date without letting a zone shift it", () => {
    expect(formatCalendarDate("2026-03-01", "en")).toBe("Mar 1, 2026");
    expect(formatCalendarDate("2026-03-01", "en", "long")).toBe("March 1, 2026");
  });
});
