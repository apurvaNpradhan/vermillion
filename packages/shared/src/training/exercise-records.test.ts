import { describe, expect, it } from "vitest";

import { exerciseRecords } from "./records";
import { loggedSet, sessionOf, setOf } from "./session-fixtures";

describe("exerciseRecords", () => {
  it("is empty without Sessions", () => {
    expect(exerciseRecords([]).size).toBe(0);
  });

  it("keeps the best of every kind per exercise, with rep records for 1 to 12", () => {
    const records = exerciseRecords([
      sessionOf("a", "2026-01-01T10:00:00Z", [
        loggedSet({ weight_kg: 100, reps: 5 }),
        loggedSet({ weight_kg: 90, reps: 8 }),
        loggedSet({ weight_kg: 50, reps: 15 }),
      ]),
      sessionOf("b", "2026-01-02T10:00:00Z", [loggedSet({ weight_kg: 95, reps: 5 })]),
    ]);
    const bench = records.get("bench");
    expect(bench?.get("heaviest_weight")).toBe(100);
    expect(bench?.get("estimated_one_rep_max")).toBeCloseTo(112.5, 10);
    expect(bench?.get("set_volume")).toBe(750);
    expect(bench?.get("session_volume")).toBe(500 + 720 + 750);
    expect(bench?.get("reps_5")).toBe(100);
    expect(bench?.get("reps_8")).toBe(90);
    expect(bench?.has("reps_15")).toBe(false);
  });

  it("leaves warm-ups and unticked sets out", () => {
    const records = exerciseRecords([
      sessionOf("a", "2026-01-01T10:00:00Z", [
        loggedSet({ kind: "warmup", weight_kg: 200, reps: 1 }),
        loggedSet({ completed_at: null, weight_kg: 200, reps: 1 }),
        loggedSet({ weight_kg: 80, reps: 5 }),
      ]),
    ]);
    expect(records.get("bench")?.get("heaviest_weight")).toBe(80);
  });

  it("separates exercises and uses the bodyweight for bodyweight types", () => {
    const sets = [
      loggedSet({ weight_kg: 100, reps: 5 }),
      setOf("bodyweight_reps", "working", { exercise_id: "pullup", weight_kg: null, reps: 8 }),
    ];
    const session = sessionOf("a", "2026-01-01T10:00:00Z", sets);
    expect([...exerciseRecords([session]).keys()].sort()).toEqual(["bench", "pullup"]);
    expect(exerciseRecords([session]).get("pullup")?.has("set_volume")).toBe(false);
    expect(exerciseRecords([session], 80).get("pullup")?.get("set_volume")).toBe(640);
  });

  it("records the longest duration and distance and the best pace of timed types", () => {
    const records = exerciseRecords([
      sessionOf("a", "2026-01-01T10:00:00Z", [
        setOf("distance_duration", "working", {
          exercise_id: "run",
          weight_kg: null,
          reps: null,
          distance_m: 5000,
          duration_s: 1800,
        }),
        setOf("distance_duration", "working", {
          exercise_id: "run",
          weight_kg: null,
          reps: null,
          distance_m: 1000,
          duration_s: 200,
        }),
      ]),
    ]);
    const run = records.get("run");
    expect(run?.get("longest_duration")).toBe(1800);
    expect(run?.get("longest_distance")).toBe(5000);
    expect(run?.get("best_pace")).toBeCloseTo(5, 10);
    expect(run?.has("heaviest_weight")).toBe(false);
  });
});
