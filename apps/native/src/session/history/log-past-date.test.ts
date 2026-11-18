import { sessionStartAllowed, zonedParts } from "@workspace/shared";
import { describe, expect, it } from "vitest";

import { logPastBounds, logPastForSave, logPastOnDay } from "./log-past-date";

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
      "2016-11-18T02:00:00.000Z",
    );
  });

  it("picks a boundary minute that is still allowed when saved later", () => {
    const picked = new Date("2026-11-18T18:25:30.000Z");
    const bounds = logPastBounds(picked, zone);
    const start = logPastOnDay("2026-11-17T10:00:00Z", bounds.min, zone, bounds); // before the edge, so clamped to it
    expect(start).toBe(new Date(bounds.earliest).toISOString());
    expect(Date.parse(start) % 60_000).toBe(0);
    expect(sessionStartAllowed(start, picked)).toBe(true);
    // Saved 20 minutes later on a fresh clock, it is still accepted.
    const later = new Date(picked.getTime() + 20 * 60_000);
    expect(sessionStartAllowed(start, later)).toBe(true);
    const saved = logPastForSave(start, later, zone);
    expect(saved !== null && sessionStartAllowed(saved, later)).toBe(true);
  });

  it("moves a start that slid out of the window to the new earliest minute on save", () => {
    const picked = new Date("2026-11-18T18:25:30.000Z");
    const bounds = logPastBounds(picked, zone);
    const start = logPastOnDay("2026-11-17T10:00:00Z", bounds.min, zone, bounds); // before the edge, so clamped to it
    expect(start).toBe(new Date(bounds.earliest).toISOString());
    const much = new Date(picked.getTime() + 3 * 3600_000);
    expect(sessionStartAllowed(start, much)).toBe(false);
    const saved = logPastForSave(start, much, zone);
    expect(saved).toBe(new Date(logPastBounds(much, zone).earliest).toISOString());
    expect(saved !== null && sessionStartAllowed(saved, much)).toBe(true);
  });

  it("refuses a value that is not a date and clamps the future to now", () => {
    const now = new Date("2026-11-18T18:25:30.000Z");
    expect(logPastForSave("nope", now, zone)).toBeNull();
    expect(logPastForSave("2027-01-01T00:00:00Z", now, zone)).toBe(now.toISOString());
  });
});
