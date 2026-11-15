import { describe, expect, it } from "vitest";

import { fromZonedParts, stepZoned, zonedParts } from "./zoned-time";

describe("zoned time", () => {
  it("reads wall-clock parts in the given zone, not the device's", () => {
    // 20:00 UTC on Nov 14 is 01:30 on Nov 15 in Kolkata.
    expect(zonedParts("2026-11-14T20:00:00.000Z", "Asia/Kolkata")).toEqual({
      year: 2026,
      month: 11,
      day: 15,
      hour: 1,
      minute: 30,
    });
  });

  it("round-trips a wall time to the same instant", () => {
    const iso = "2026-11-14T20:00:00.000Z";
    expect(fromZonedParts(zonedParts(iso, "Asia/Kolkata"), "Asia/Kolkata")).toBe(iso);
    expect(fromZonedParts(zonedParts(iso, "America/New_York"), "America/New_York")).toBe(iso);
  });

  it("steps a day across midnight in the zone", () => {
    const next = stepZoned("2026-11-14T18:00:00.000Z", "Asia/Kolkata", "day", 1);
    expect(zonedParts(next, "Asia/Kolkata")).toMatchObject({ day: 15, hour: 23, minute: 30 });
  });

  it("keeps the wall clock when a day step crosses a DST change", () => {
    // New York leaves DST on 2026-11-01; 09:00 stays 09:00 the next day.
    const before = fromZonedParts(
      { year: 2026, month: 10, day: 31, hour: 9, minute: 0 },
      "America/New_York",
    );
    const after = stepZoned(before, "America/New_York", "day", 1);
    expect(zonedParts(after, "America/New_York")).toMatchObject({ day: 1, month: 11, hour: 9 });
    expect(Date.parse(after) - Date.parse(before)).toBe(25 * 3600 * 1000);
  });

  it("clamps the day when stepping months", () => {
    const jan31 = fromZonedParts({ year: 2026, month: 1, day: 31, hour: 12, minute: 0 }, "UTC");
    expect(zonedParts(stepZoned(jan31, "UTC", "month", 1), "UTC")).toMatchObject({
      month: 2,
      day: 28,
    });
  });
});
