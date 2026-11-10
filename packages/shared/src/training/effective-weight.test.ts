import { describe, expect, it } from "vitest";

import { effectiveWeight } from "./volume";

describe("effectiveWeight", () => {
  it("is the logged weight for weighted types", () => {
    expect(effectiveWeight("weight_reps", 100, 80)).toBe(100);
    expect(effectiveWeight("weight_reps", null, 80)).toBeNull();
    expect(effectiveWeight("short_distance_weight", 150, null)).toBe(150);
  });

  it("is the bodyweight for bodyweight types, and unknown without one", () => {
    expect(effectiveWeight("bodyweight_reps", null, 80)).toBe(80);
    expect(effectiveWeight("bodyweight_reps", null, null)).toBeNull();
    expect(effectiveWeight("bodyweight_reps", null)).toBeNull();
  });

  it("is the bodyweight minus the assistance for assisted types, floored at 0", () => {
    expect(effectiveWeight("bodyweight_assisted_reps", 20, 80)).toBe(60);
    expect(effectiveWeight("bodyweight_assisted_reps", null, 80)).toBe(80);
    expect(effectiveWeight("bodyweight_assisted_reps", 100, 80)).toBe(0);
    expect(effectiveWeight("bodyweight_assisted_reps", 20, null)).toBeNull();
  });

  it("is null for types that move no weight", () => {
    for (const type of [
      "reps_only",
      "duration",
      "distance_duration",
      "floors_duration",
      "steps_duration",
    ] as const) {
      expect(effectiveWeight(type, 50, 80)).toBeNull();
    }
  });
});
