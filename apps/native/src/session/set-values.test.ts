import type { LoggedSet, PlannedSet, SessionHistory } from "@workspace/shared";
import { describe, expect, it } from "vitest";

import {
  patchFor,
  valueOfSet,
  formatCell,
  ghostsOf,
  loggedSetsOf,
  ordinalOf,
  previousLabel,
  previousOfRow,
  previousPatch,
} from "./set-values";

const loggedSet = (overrides: Partial<LoggedSet>): LoggedSet => ({
  id: "set",
  exercise_id: "bench",
  exercise_type: "weight_reps",
  kind: "working",
  completed_at: "2026-01-01T10:00:00.000Z",
  weight_kg: 100,
  reps: 5,
  ...overrides,
});
const sessionOf = (id: string, startedAt: string, sets: LoggedSet[]): SessionHistory => ({
  id,
  started_at: startedAt,
  finished_at: startedAt,
  sets,
});

const kinds = (...list: ("warmup" | "working" | "drop" | "failure")[]) =>
  list.map((kind) => ({ kind }));

describe("Previous", () => {
  it("matches by kind and place among that kind", () => {
    const sets = kinds("warmup", "working", "working", "drop", "working");
    expect([0, 1, 2, 3, 4].map((index) => ordinalOf(sets, index))).toEqual([0, 0, 1, 0, 2]);
  });

  it("finds the matching set of the latest finished Session", () => {
    const old = sessionOf("old", "2026-01-01T10:00:00.000Z", [
      loggedSet({ id: "w1", kind: "working", weight_kg: 80, reps: 8 }),
    ]);
    const last = sessionOf("last", "2026-01-08T10:00:00.000Z", [
      loggedSet({ id: "u1", kind: "warmup", weight_kg: 40, reps: 10 }),
      loggedSet({ id: "u2", kind: "working", weight_kg: 100, reps: 5 }),
      loggedSet({ id: "u3", kind: "working", weight_kg: 102.5, reps: 5 }),
    ]);
    const sets = kinds("warmup", "working", "working", "working");
    expect(previousOfRow([old, last], sets, 0)?.id).toBe("u1");
    expect(previousOfRow([old, last], sets, 2)?.id).toBe("u3");
    // Past the sets that were done last time: nothing, not an older Session's set.
    expect(previousOfRow([old, last], sets, 3)).toBeNull();
    expect(previousOfRow(undefined, sets, 0)).toBeNull();
    expect(previousOfRow([old, last], sets, 9)).toBeNull();
  });
});

describe("Ghost values", () => {
  const target: PlannedSet = {
    kind: "working",
    reps_min: 5,
    reps_max: 8,
    weight_kg: 100,
    effort_min: 8,
    effort_max: 8,
  };

  it("takes Previous, else the planned target, with reps by the range rule", () => {
    expect(ghostsOf("weight_reps", null, target, false)).toEqual({ weight: 100, reps: 5 });
    expect(ghostsOf("weight_reps", { weight_kg: 90, reps: 7 }, target, false)).toEqual({
      weight: 90,
      reps: 7,
    });
    expect(ghostsOf("weight_reps", { weight_kg: 90, reps: 12 }, target, false)).toEqual({
      weight: 90,
      reps: 5,
    });
    expect(ghostsOf("weight_reps", null, null, false)).toEqual({ weight: null, reps: null });
  });

  it("adds an effort Ghost only while the exercise logs effort", () => {
    expect(ghostsOf("weight_reps", null, target, true)).toEqual({ weight: 100, reps: 5, rpe: 8 });
    expect(ghostsOf("duration", null, { kind: "working", duration_s: 30 }, false)).toEqual({
      duration: 30,
    });
  });
});

describe("Previous cell", () => {
  it("shows weight × reps, else the recorded fields", () => {
    expect(previousLabel({ weight_kg: 60, reps: 8 }, "weight_reps", "kg")).toBe("60 × 8");
    expect(previousLabel({ weight_kg: 60 * 0.45359237, reps: 8 }, "weight_reps", "lb")).toBe(
      "60 × 8",
    );
    expect(previousLabel({ reps: 12 }, "reps_only", "kg")).toBe("12");
    expect(previousLabel({ duration_s: 90 }, "duration", "kg")).toBe("1:30");
    expect(previousLabel({ distance_m: 1000.04, duration_s: 300 }, "distance_duration", "kg")).toBe(
      "1000 · 5:00",
    );
    expect(previousLabel({}, "weight_reps", "kg")).toBeNull();
  });

  it("formats each cell for the user's unit", () => {
    expect(formatCell("weight", 22.5, "kg")).toBe("22.5");
    expect(formatCell("weight", null, "kg")).toBe("");
    expect(formatCell("reps", 8, "kg")).toBe("8");
    expect(formatCell("duration", 45, "kg")).toBe("0:45");
  });

  it("copies the recorded fields on tap, and effort only when logged on a reps type", () => {
    const previous = { weight_kg: 60, reps: 8, rpe: 8.5, duration_s: 30 };
    expect(previousPatch(previous, "weight_reps", false)).toEqual({ weight_kg: 60, reps: 8 });
    expect(previousPatch(previous, "weight_reps", true)).toEqual({
      weight_kg: 60,
      reps: 8,
      rpe: 8.5,
    });
    expect(previousPatch(previous, "duration", true)).toEqual({ duration_s: 30 });
  });
});

describe("loggedSetsOf", () => {
  it("lists every set of the Session with its exercise's type", () => {
    const detail = {
      exercises: [
        {
          exerciseId: "bench",
          type: "weight_reps" as const,
          sets: [
            {
              id: "s1",
              kind: "working" as const,
              completedAt: "2026-01-01T10:00:00.000Z",
              weightKg: 100,
              reps: 5,
              durationS: null,
              distanceM: null,
              floors: null,
              steps: null,
              rpe: null,
            },
          ],
        },
      ],
    };
    // Only the fields `loggedSetsOf` reads are given.
    const sets = loggedSetsOf(detail as never);
    expect(sets).toEqual([
      {
        id: "s1",
        exercise_id: "bench",
        exercise_type: "weight_reps",
        kind: "working",
        completed_at: "2026-01-01T10:00:00.000Z",
        weight_kg: 100,
        reps: 5,
        duration_s: null,
        distance_m: null,
        floors: null,
        steps: null,
        rpe: null,
      },
    ]);
  });
});

describe("valueOfSet", () => {
  it("reads the cell of a field from a Session set", () => {
    const set = { weightKg: 60, reps: 8, durationS: 30, distanceM: 100, floors: 3, steps: 400 };
    expect(
      (["weight", "reps", "duration", "distance", "floors", "steps"] as const).map((field) =>
        valueOfSet(set, field),
      ),
    ).toEqual([60, 8, 30, 100, 3, 400]);
  });
});

describe("patchFor", () => {
  it("writes one cell", () => {
    expect(patchFor("weight", 60)).toEqual({ weight_kg: 60 });
    expect(patchFor("duration", null)).toEqual({ duration_s: null });
    expect(patchFor("steps", 100)).toEqual({ steps: 100 });
  });
});
