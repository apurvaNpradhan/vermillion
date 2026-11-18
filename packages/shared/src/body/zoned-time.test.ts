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

describe("zoned time across DST transitions", () => {
  const zone = "America/New_York";
  const at = (day: number, hour: number, minute: number, month = 3) =>
    fromZonedParts({ year: 2026, month, day, hour, minute }, zone);

  it("steps hours and minutes by elapsed time over the spring-forward gap", () => {
    // 2026-03-08: 02:00 -> 03:00. 01:30 EST + 1 h is 03:30 EDT.
    const start = at(8, 1, 30);
    const later = stepZoned(start, zone, "hour", 1);
    expect(Date.parse(later) - Date.parse(start)).toBe(3600_000);
    expect(zonedParts(later, zone)).toMatchObject({ hour: 3, minute: 30 });
    expect(stepZoned(later, zone, "hour", -1)).toBe(start);
    const minute = stepZoned(at(8, 1, 59), zone, "minute", 1);
    expect(zonedParts(minute, zone)).toMatchObject({ hour: 3, minute: 0 });
  });

  it("steps by elapsed time over the fall-back repeat", () => {
    // 2026-11-01: 02:00 EDT -> 01:00 EST. 01:30 EDT + 1 h is 01:30 EST.
    const first = at(1, 1, 30, 11);
    const second = stepZoned(first, zone, "hour", 1);
    expect(Date.parse(second) - Date.parse(first)).toBe(3600_000);
    expect(zonedParts(second, zone)).toMatchObject({ hour: 1, minute: 30 });
    expect(stepZoned(second, zone, "hour", 1)).not.toBe(second);
  });

  it("resolves a nonexistent wall time forward past the gap", () => {
    const resolved = at(8, 2, 30);
    expect(zonedParts(resolved, zone)).toMatchObject({ hour: 3, minute: 30 });
  });

  it("resolves a repeated wall time to its first occurrence", () => {
    const resolved = at(1, 1, 30, 11);
    expect(resolved).toBe("2026-11-01T05:30:00.000Z"); // 01:30 EDT, before the clocks go back
  });
});
