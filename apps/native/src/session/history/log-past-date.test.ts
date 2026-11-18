import { zonedParts } from "@workspace/shared";
import { describe, expect, it } from "vitest";

import { logPastBounds, logPastOnDay } from "./log-past-date";

const zone = "America/Los_Angeles";

describe("logging a date in the account time zone", () => {
  it("preserves wall-clock time when the picked date had a different UTC offset", () => {
    const now = new Date("2026-11-18T18:25:00.000Z");
    const bounds = logPastBounds(now, zone);
    const picked = logPastOnDay(now.toISOString(), Date.UTC(2026, 9, 31), zone, bounds);
    expect(picked).toBe("2026-10-31T17:25:00.000Z");
    expect(zonedParts(picked, zone)).toMatchObject({ day: 31, hour: 10, minute: 25 });
  });

  it("clamps the time on boundary days and calculates those days in the account zone", () => {
    const now = new Date("2026-11-18T01:00:00.000Z");
    const bounds = logPastBounds(now, zone);
    expect(bounds.today).toBe(Date.UTC(2026, 10, 17));
    expect(bounds.min).toBe(Date.UTC(2016, 10, 17));
    expect(logPastOnDay("2026-11-17T04:00:00Z", bounds.today, zone, bounds)).toBe(
      now.toISOString(),
    );
    expect(logPastOnDay("2026-11-17T00:00:00Z", bounds.min, zone, bounds)).toBe(
      "2016-11-18T01:00:00.000Z",
    );
  });
});
