import { describe, expect, it } from "vitest";

import { trainRows } from "./train-rows";

const workouts = [{ id: "c" }, { id: "b" }, { id: "a" }];

describe("trainRows", () => {
  it("lists every Workout without headings when no Program is active", () => {
    const rows = trainRows({ workouts, activeWorkoutIds: null, ownedIds: new Set(["b"]) });
    expect(rows.map((row) => (row.kind === "workout" ? row.workout.id : row.id))).toEqual([
      "c",
      "b",
      "a",
    ]);
    expect(rows.map((row) => row.kind === "workout" && row.owned)).toEqual([false, true, false]);
  });

  it("puts the active Program's Workouts first in Rotation order, once each", () => {
    const rows = trainRows({
      workouts,
      activeWorkoutIds: ["a", null, "b", "a"],
      ownedIds: new Set(["a", "b"]),
    });
    expect(rows.map((row) => (row.kind === "workout" ? row.workout.id : row.id))).toEqual([
      "program",
      "a",
      "b",
      "other",
      "c",
    ]);
  });

  it("skips Workouts that have not arrived and empty groups", () => {
    const rows = trainRows({
      workouts: [{ id: "a" }],
      activeWorkoutIds: ["a", "missing"],
      ownedIds: new Set(["a"]),
    });
    expect(rows.map((row) => (row.kind === "workout" ? row.workout.id : row.id))).toEqual([
      "program",
      "a",
    ]);
  });
});
