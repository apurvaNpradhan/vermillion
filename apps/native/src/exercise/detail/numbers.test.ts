import { describe, expect, it } from "vitest";
import type { LoggedSet, SessionHistory } from "@workspace/shared";
import {
  datedRecords,
  formatClock,
  formatPace,
  humanDistance,
  paceSecondsPerKm,
  metricSeries,
  metricsFor,
  recordsByYear,
  recordYears,
  workingSetNumber,
} from "./numbers";
const set: LoggedSet = {
  id: "set",
  exercise_id: "ex",
  exercise_type: "weight_reps",
  kind: "working",
  completed_at: "2026-11-01",
  weight_kg: 50,
  reps: 10,
  duration_s: null,
  distance_m: null,
  floors: null,
  steps: null,
};
const session = (id: string, sets: LoggedSet[], date = "2026-11-01"): SessionHistory => ({
  id,
  started_at: date,
  finished_at: date,
  sets,
});
describe("exercise numbers", () => {
  it("computes each session, excludes warmups and orders points by date", () => {
    const history = [
      session("later", [{ ...set, weight_kg: 40 }], "2026-11-02"),
      session("first", [set, { ...set, id: "warm", kind: "warmup", weight_kg: 100 }]),
    ];
    expect(metricSeries(history, "ex", "session_volume", null).map((p) => p.y)).toEqual([500, 400]);
    expect(datedRecords(history, "ex", null).find((r) => r.key === "heaviest_weight")).toEqual({
      key: "heaviest_weight",
      value: 50,
      date: "2026-11-01",
    });
  });
  it("uses bodyweight and omits uncomputable weight records", () => {
    const history = [
      session("s", [{ ...set, exercise_type: "bodyweight_assisted_reps", weight_kg: 20 }]),
    ];
    expect(metricSeries(history, "ex", "session_volume", null)).toEqual([]);
    expect(metricSeries(history, "ex", "session_volume", 80)[0]?.y).toBe(600);
    expect(metricSeries(history, "ex", "total_reps", null)[0]?.y).toBe(10);
  });
  it("offers relevant metrics for every recording type", () => {
    expect(metricsFor("duration")).toEqual(["longest_duration"]);
    expect(metricsFor("distance_duration")).toEqual([
      "longest_duration",
      "longest_distance",
      "best_pace",
    ]);
    expect(metricsFor("reps_only")).toEqual(["total_reps", "most_reps"]);
    expect(metricsFor("floors_duration")).toEqual(["longest_duration", "floors"]);
    expect(metricsFor("steps_duration")).toEqual(["longest_duration", "steps"]);
    expect(metricsFor("short_distance_weight")).toEqual(["heaviest_weight", "longest_distance"]);
    expect(metricsFor("bodyweight_reps")).toContain("total_reps");
    expect(metricsFor("weight_reps")).toContain("estimated_one_rep_max");
  });
  it("omits unticked, warm-up-only and unrelated sets", () => {
    const history = [
      session("empty", [
        { ...set, completed_at: null },
        { ...set, id: "warmup", kind: "warmup" },
        { ...set, id: "other", exercise_id: "other" },
      ]),
    ];
    expect(metricSeries(history, "ex", "total_reps", null)).toEqual([]);
    expect(datedRecords(history, "ex", null)).toEqual([]);
  });
  it("computes pace and retains the earliest date on tied records", () => {
    const timed = {
      ...set,
      exercise_type: "distance_duration" as const,
      distance_m: 100,
      duration_s: 20,
    };
    const history = [session("later", [timed], "2026-11-02"), session("first", [timed])];
    expect(metricSeries(history, "ex", "best_pace", null).map((p) => p.y)).toEqual([5, 5]);
    expect(datedRecords(history, "ex", null).find((r) => r.key === "best_pace")?.date).toBe(
      "2026-11-01",
    );
    expect(datedRecords([history[0]!], "ex", null).find((r) => r.key === "best_pace")?.date).toBe(
      "2026-11-02",
    );
  });
});

describe("workingSetNumber", () => {
  it("numbers only working sets among mixed kinds", () => {
    const sets = [
      { kind: "top" },
      { kind: "backoff" },
      { kind: "working" },
      { kind: "myo" },
    ] as const;
    expect(sets.map((_, i) => workingSetNumber(sets, i))).toEqual([null, null, 1, null]);
  });
});

describe("records by year", () => {
  const history = [
    session("old", [{ ...set, weight_kg: 100, reps: 5 }], "2025-06-10T10:00:00Z"),
    session("new", [{ ...set, weight_kg: 80, reps: 8 }], "2026-03-01T10:00:00Z"),
    session("other", [{ ...set, exercise_id: "else" }], "2024-01-01T10:00:00Z"),
  ];

  it("lists the years with a counted set of the exercise, newest first", () => {
    expect(recordYears(history, "ex", "UTC")).toEqual([2026, 2025]);
  });

  it("scopes the best lifts to the year and keeps the all-time best beside them", () => {
    const records = recordsByYear(history, "ex", null, 2026, "UTC");
    const heaviest = records.find((record) => record.key === "heaviest_weight");
    expect(heaviest).toEqual({
      key: "heaviest_weight",
      value: 80,
      date: "2026-03-01T10:00:00Z",
      allTime: 100,
    });
    expect(recordsByYear(history, "ex", null, 2024, "UTC")).toEqual([]);
  });

  it("buckets by the account's calendar day", () => {
    const edge = [session("edge", [set], "2026-01-01T02:00:00Z")];
    expect(recordYears(edge, "ex", "America/Los_Angeles")).toEqual([2025]);
    expect(recordYears(edge, "ex", "UTC")).toEqual([2026]);
  });
});

describe("human units", () => {
  it("writes durations as clocks", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(45)).toBe("0:45");
    expect(formatClock(2400)).toBe("40:00");
    expect(formatClock(3900)).toBe("1:05:00");
    expect(formatClock(3599.6)).toBe("1:00:00");
  });

  it("writes distances in kilometres, or metres under one kilometre", () => {
    expect(humanDistance(7000, "en")).toEqual({ value: "7.0", unit: "km" });
    expect(humanDistance(7249, "en")).toEqual({ value: "7.2", unit: "km" });
    expect(humanDistance(1000, "en")).toEqual({ value: "1.0", unit: "km" });
    expect(humanDistance(850, "en")).toEqual({ value: "850", unit: "m" });
    expect(humanDistance(999.6, "en")).toEqual({ value: "1.0", unit: "km" });
    expect(humanDistance(999.4, "en")).toEqual({ value: "999", unit: "m" });
    expect(humanDistance(7249, "de")).toEqual({ value: "7,2", unit: "km" });
  });

  it("writes pace per kilometre, not metres per second", () => {
    // 1000 m in 343 s is 5:43 /km.
    expect(formatPace(1000 / 343)).toBe("5:43");
    expect(formatPace(1000 / 300)).toBe("5:00");
    expect(paceSecondsPerKm(2.5)).toBe(400);
    expect(formatPace(0)).toBe("–");
    expect(paceSecondsPerKm(Number.NaN)).toBeNull();
  });
});
