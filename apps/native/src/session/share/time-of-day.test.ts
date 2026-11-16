import { describe, expect, it } from "vitest";

import { timeOfDay } from "./time-of-day";

describe("time of day", () => {
  it.each([
    ["2026-11-16T04:59:00Z", "night"],
    ["2026-11-16T05:00:00Z", "morning"],
    ["2026-11-16T11:59:00Z", "morning"],
    ["2026-11-16T12:00:00Z", "afternoon"],
    ["2026-11-16T16:59:00Z", "afternoon"],
    ["2026-11-16T17:00:00Z", "evening"],
    ["2026-11-16T20:59:00Z", "evening"],
    ["2026-11-16T21:00:00Z", "night"],
    ["2026-11-16T00:30:00Z", "night"],
  ] as const)("reads %s in UTC as %s", (iso, expected) => {
    expect(timeOfDay(iso, "UTC")).toBe(expected);
  });

  it("uses the user's time zone, not the instant's UTC hour", () => {
    // 23:00 UTC is 08:00 the next day in Tokyo and 18:00 in New York.
    expect(timeOfDay("2026-11-16T23:00:00Z", "Asia/Tokyo")).toBe("morning");
    expect(timeOfDay("2026-11-16T23:00:00Z", "America/New_York")).toBe("evening");
  });
});
