import { describe, expect, it } from "vitest";

import { daysSince, trendIsStale, weighInCounts } from "./weigh-in-days";

describe("weighInCounts", () => {
  it("marks each weighed day once, however many entries it has", () => {
    const counts = weighInCounts([
      { local_date: "2026-11-18" },
      { local_date: "2026-11-18" },
      { local_date: "2026-11-16" },
    ]);
    expect(counts.size).toBe(2);
    expect(counts.get(Date.UTC(2026, 10, 18))).toBe(1);
  });
  it("skips a date it cannot read", () => {
    expect(weighInCounts([{ local_date: "nope" }]).size).toBe(0);
  });
});

describe("daysSince", () => {
  it("counts whole days", () => {
    expect(daysSince("2026-11-10", "2026-11-18")).toBe(8);
    expect(daysSince("2026-11-18", "2026-11-18")).toBe(0);
  });
  it("is never negative", () => {
    expect(daysSince("2026-11-20", "2026-11-18")).toBe(0);
  });
});

describe("trendIsStale", () => {
  it("is stale after more than seven days", () => {
    expect(trendIsStale("2026-11-10", "2026-11-18")).toBe(true);
    expect(trendIsStale("2026-11-11", "2026-11-18")).toBe(false);
  });
  it("is not stale without any weigh-in at all", () => {
    expect(trendIsStale(null, "2026-11-18")).toBe(false);
  });
});
