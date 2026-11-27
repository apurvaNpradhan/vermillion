import { describe, expect, it } from "vitest";

import { workoutNumber } from "./week-count";

const slots = [
  { id: "a", workoutId: "push" },
  { id: "r1", workoutId: null },
  { id: "b", workoutId: "pull" },
  { id: "r2", workoutId: null },
  { id: "c", workoutId: "legs" },
];

describe("workoutNumber", () => {
  it("counts Workouts only, never rest days", () => {
    expect(workoutNumber(slots, "a")).toBe(1);
    expect(workoutNumber(slots, "b")).toBe(2);
    expect(workoutNumber(slots, "c")).toBe(3);
  });

  it("is 0 for a rest day, an unknown slot or none", () => {
    expect(workoutNumber(slots, "r1")).toBe(0);
    expect(workoutNumber(slots, "zz")).toBe(0);
    expect(workoutNumber(slots, null)).toBe(0);
    expect(workoutNumber([], "a")).toBe(0);
  });
});
