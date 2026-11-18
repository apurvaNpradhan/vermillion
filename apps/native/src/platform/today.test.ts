import { describe, expect, it } from "vitest";

import { msUntilNextDay, nextCheckDelay, sameDayOrNow } from "./today";

const HOUR = 3_600_000;

describe("msUntilNextDay", () => {
  it("counts to local midnight, not UTC midnight", () => {
    // 2026-11-18 21:30 UTC is 22:30 in Berlin (UTC+1): 90 minutes to go.
    expect(msUntilNextDay(new Date("2026-11-18T21:30:00Z"), "Europe/Berlin")).toBe(1.5 * HOUR);
    // The same instant is 13:30 in Los Angeles (UTC-8): 10.5 hours to go.
    expect(msUntilNextDay(new Date("2026-11-18T21:30:00Z"), "America/Los_Angeles")).toBe(
      10.5 * HOUR,
    );
  });
  it("never returns less than a second", () => {
    expect(msUntilNextDay(new Date("2026-11-18T22:59:59.999Z"), "Europe/Berlin")).toBe(1000);
  });
});

describe("nextCheckDelay", () => {
  it("waits just past midnight when it is near, and at most an hour otherwise", () => {
    expect(nextCheckDelay(new Date("2026-11-18T22:30:00Z"), "Europe/Berlin")).toBe(
      0.5 * HOUR + 1000,
    );
    expect(nextCheckDelay(new Date("2026-11-18T10:00:00Z"), "Europe/Berlin")).toBe(HOUR);
  });
});

describe("sameDayOrNow", () => {
  const zone = "Europe/Berlin";
  it("keeps the instant within a local day", () => {
    const current = new Date("2026-11-18T08:00:00Z");
    expect(sameDayOrNow(current, new Date("2026-11-18T21:00:00Z"), zone)).toBe(current);
  });
  it("moves to the new instant when the local day changes", () => {
    const current = new Date("2026-11-18T21:00:00Z");
    const next = new Date("2026-11-18T23:30:00Z");
    expect(sameDayOrNow(current, next, zone)).toBe(next);
  });
});
