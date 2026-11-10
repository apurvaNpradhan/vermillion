import { describe, expect, it } from "vitest";
import type { LoggedSet, SessionHistory } from "@workspace/shared";
import { datedRecords, metricSeries, metricsFor } from "./numbers";
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
    expect(metricsFor("reps_only")).toEqual(["total_reps"]);
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
