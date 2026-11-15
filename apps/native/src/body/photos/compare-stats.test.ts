import { dailyWeights, trendSeries } from "@workspace/shared";
import { describe, expect, it } from "vitest";

import { sideStats, statsChange } from "./compare-stats";

const trend = trendSeries(
  dailyWeights([
    { local_date: "2026-01-01", value: 90 },
    { local_date: "2026-01-11", value: 88 },
  ]),
);
const waist = [
  { local_date: "2026-01-01", measured_at: "2026-01-01T08:00:00Z", value: 100 },
  { local_date: "2026-01-09", measured_at: "2026-01-09T08:00:00Z", value: 98 },
];

describe("compare side stats", () => {
  it("reads the trend on the date and the latest waist on or before it", () => {
    const early = sideStats("2026-01-01", trend, waist);
    expect(early.weightKg).toBe(90);
    expect(early.waistCm).toBe(100);
    const late = sideStats("2026-01-11", trend, waist);
    expect(late.waistCm).toBe(98);
    expect(late.weightKg).toBeLessThan(90);
    expect(late.weightKg).toBeGreaterThan(88);
  });

  it("has nothing before the first entry", () => {
    expect(sideStats("2025-12-01", trend, waist)).toEqual({ weightKg: null, waistCm: null });
    expect(sideStats("2026-01-05", [], [])).toEqual({ weightKg: null, waistCm: null });
  });

  it("reports the change only where both sides have a value", () => {
    expect(statsChange({ weightKg: 90, waistCm: 100 }, { weightKg: 87.5, waistCm: null })).toEqual({
      weightKg: -2.5,
      waistCm: null,
    });
    expect(statsChange({ weightKg: null, waistCm: 80 }, { weightKg: 70, waistCm: 78 })).toEqual({
      weightKg: null,
      waistCm: -2,
    });
  });
});
