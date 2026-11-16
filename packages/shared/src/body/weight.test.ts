import { describe, it, expect, vi } from "vitest";
import {
  dailyWeights,
  trendSeries,
  trendAt,
  changeOver,
  ratePerWeek,
  weightChanges,
  weeklyPoints,
  weighInDays,
  kgToLb,
  lbToKg,
  cmToIn,
  inToCm,
  displayMeasurement,
  formatBodyWeight,
  shownWeight,
  measurementPatch,
  measurementInput,
  validMeasurementDate,
} from "../body";
import { uiPreferencesSchema } from "../preferences";
import { sessionTotals } from "../training/volume/volume";
import { exerciseRecords, recordFlags } from "../training/progress/records";
const daily = [
  { date: "2026-01-01", scale: 80 },
  { date: "2026-01-03", scale: 82 },
];
describe("weight log", () => {
  it("averages multiple weigh-ins per day and orders dates", () => {
    expect(
      dailyWeights([
        { local_date: "2026-01-03", value: 82 },
        { local_date: "2026-01-01", value: 79 },
        { local_date: "2026-01-01", value: 81 },
      ]),
    ).toEqual(daily);
  });
  it("seeds a single entry and interpolates only between logged days", () => {
    expect(trendSeries([])).toEqual([]);
    expect(trendSeries(daily.slice(0, 1))).toEqual([
      { date: "2026-01-01", scale: 80, trend: 80, interpolated: false },
    ]);
    const series = trendSeries(daily);
    expect(series[1]).toEqual({ date: "2026-01-02", scale: null, trend: 80.1, interpolated: true });
    expect(series[2]?.trend).toBeCloseTo(80.29);
    expect(series[2]?.interpolated).toBe(false);
    expect(trendAt(series, "2025-12-31")).toBeNull();
    expect(trendAt(series, "2026-01-02")).toBe(80.1);
    expect(trendAt(series, "2026-02-01")).toBeCloseTo(80.29);
    expect(changeOver(series, 7)).toBeNull();
    expect(changeOver(series, 2)).toBeCloseTo(0.29);
  });
  it("calculates regression on the last 14 days and neutral change thresholds", () => {
    const points = Array.from({ length: 100 }, (_, i) => ({
      date: new Date(Date.UTC(2026, 0, i + 1)).toISOString().slice(0, 10),
      scale: 80 + i,
      trend: 80 + i,
      interpolated: false,
    }));
    expect(ratePerWeek(points)).toBeCloseTo(7);
    expect(ratePerWeek(points.slice(0, 1))).toBeNull();
    expect(weightChanges(points).map((c) => [c.days, c.change, c.direction])).toEqual(
      [3, 7, 14, 30, 90].map((d) => [d, d, "increase"]),
    );
    const flat = points.map((p) => ({ ...p, trend: 80 }));
    expect(weightChanges(flat).every((c) => c.direction === "stable")).toBe(true);
    expect(weightChanges(points.map((p) => ({ ...p, trend: -p.trend })))[0]?.direction).toBe(
      "decrease",
    );
    expect(weeklyPoints(points).length).toBeLessThan(points.length);
    expect(weeklyPoints(points).at(-1)).toMatchObject({
      date: points.at(-1)?.date,
      trend: points.at(-1)?.trend,
    });
  });
  it("marks logged days once and converts display units without storing rounding", () => {
    expect(weighInDays([{ local_date: "2026-01-03", value: 80 }], "2026-01-03", 3)).toEqual([
      { date: "2026-01-01", logged: false },
      { date: "2026-01-02", logged: false },
      { date: "2026-01-03", logged: true },
    ]);
    expect(lbToKg(kgToLb(82.345))).toBeCloseTo(82.345);
    expect(inToCm(cmToIn(180))).toBeCloseTo(180);
    expect(displayMeasurement(12.345)).toBe(12.3);
    expect(uiPreferencesSchema.parse({ weightUnit: "lb" }).lengthUnit).toBe("in");
    expect(uiPreferencesSchema.parse({ weightUnit: "lb", lengthUnit: "cm" }).lengthUnit).toBe("cm");
  });
  it("validates calendar dates, ranges and backfill boundaries", () => {
    expect(validMeasurementDate("2016-01-01", "2026-01-01")).toBe(true);
    expect(validMeasurementDate("2015-12-31", "2026-01-01")).toBe(false);
    expect(validMeasurementDate("2026-01-02", "2026-01-01")).toBe(false);
    expect(measurementPatch.parse({ value: 81 })).toEqual({ value: 81 });
    const input = {
      metric: "weight",
      value: 80,
      local_date: "2026-01-01",
      measured_at: "2026-01-01T10:00:00Z",
      source: "manual",
    };
    expect(measurementInput.safeParse(input).success).toBe(true);
    for (const patch of [
      { value: 401 },
      { value: 19 },
      { metric: "nope" },
      { local_date: "2026-02-30" },
    ])
      expect(measurementInput.safeParse({ ...input, ...patch }).success).toBe(false);
  });
  it("accepts a local tomorrow that is already today east of UTC, but refuses future instants", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-01-01T23:30:00Z"));
      const input = {
        metric: "weight",
        value: 80,
        measured_at: "2026-01-01T23:30:00Z",
        local_date: "2026-01-02",
        source: "manual",
      };
      expect(measurementInput.safeParse(input).success).toBe(true);
      expect(
        measurementInput.safeParse({ ...input, measured_at: "2026-01-02T00:30:00Z" }).success,
      ).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
  it("uses each Session's trend for totals and records instead of today's fallback", () => {
    const set = {
      id: "a",
      exercise_id: "pullup",
      exercise_type: "bodyweight_reps",
      kind: "working",
      completed_at: "2026-01-01",
      weight_kg: null,
      reps: 10,
      bodyweight_kg: 80,
    } as const;
    const sessions = [
      { id: "a", started_at: "2026-01-01", finished_at: "2026-01-01", sets: [set] },
      {
        id: "b",
        started_at: "2026-01-03",
        finished_at: "2026-01-03",
        sets: [{ ...set, id: "b", bodyweight_kg: 82 }],
      },
    ];
    expect(sessionTotals(sessions[0]!.sets, 100).volume).toBe(800);
    expect(exerciseRecords(sessions, 100).get("pullup")?.get("session_volume")).toBe(820);
    expect(recordFlags(sessions, 100).get("b")).toContain("session_volume");
  });
});

describe("review fixes", () => {
  it("gives no direction before any comparison history exists", () => {
    const series = trendSeries(dailyWeights([{ local_date: "2026-01-05", value: 80 }]));
    for (const row of weightChanges(series)) {
      expect(row.change).toBeNull();
      expect(row.direction).toBeNull();
    }
  });

  it("keeps real weigh-ins when sampling sparse weeks", () => {
    const series = trendSeries(
      dailyWeights([
        { local_date: "2026-01-05", value: 80 },
        { local_date: "2026-01-12", value: 81 },
        { local_date: "2026-01-19", value: 82 },
      ]),
    );
    const weeks = weeklyPoints(series);
    expect(weeks.map((p) => p.scale)).toEqual([80, 81, 82]);
    expect(weeks.every((p) => !p.interpolated)).toBe(true);
    expect(weeks[0]?.date).toBe("2026-01-11");
  });

  it("averages several weigh-ins inside one week", () => {
    const series = trendSeries(
      dailyWeights([
        { local_date: "2026-01-05", value: 80 },
        { local_date: "2026-01-07", value: 82 },
      ]),
    );
    expect(weeklyPoints(series)[0]?.scale).toBe(81);
  });

  it("formats body weight to one decimal, not plate steps", () => {
    expect(formatBodyWeight(80.1, "kg", "en")).toBe("80.1");
    expect(formatBodyWeight(80, "lb", "en")).toBe("176.4");
    expect(formatBodyWeight(-0.11, "kg", "en")).toBe("-0.1");
  });

  it("shows a stored kilogram value as the field does, so unchanged values compare equal", () => {
    const kg = 80;
    expect(shownWeight(kg, "lb")).toBe(176.4);
    expect(shownWeight(lbToKg(176.4), "lb")).toBe(176.4);
    expect(shownWeight(80.04, "kg")).toBe(80);
  });
});
