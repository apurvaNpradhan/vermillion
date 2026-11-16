import { describe, expect, it } from "vitest";

import {
  GOAL_RANGES,
  TARGET_MUSCLES,
  goalRange,
  isTargetMuscle,
  muscleGoalSchema,
  muscleGoalsSchema,
  muscleStatus,
} from "./muscle-targets";

describe("goalRange", () => {
  it("defaults to Grow", () => {
    expect(goalRange(undefined)).toEqual({ min: 10, max: 20 });
  });

  it.each([
    ["maintain", { min: 6, max: 10 }],
    ["grow", { min: 10, max: 20 }],
    ["focus", { min: 16, max: 24 }],
  ] as const)("%s uses its preset range", (level, range) => {
    expect(goalRange({ level })).toEqual(range);
    expect(GOAL_RANGES[level]).toEqual(range);
  });

  it("uses the typed range of a Custom goal", () => {
    expect(goalRange({ level: "custom", min: 4, max: 12 })).toEqual({ min: 4, max: 12 });
  });
});

describe("muscleStatus", () => {
  const range = { min: 10, max: 20 };
  it("is below under the minimum, on target on both ends, above over the maximum", () => {
    expect(muscleStatus(9.5, range)).toBe("below");
    expect(muscleStatus(10, range)).toBe("on_target");
    expect(muscleStatus(20, range)).toBe("on_target");
    expect(muscleStatus(20.5, range)).toBe("above");
  });
});

describe("muscleGoalsSchema", () => {
  it("accepts presets and a valid Custom range, rejects an inverted or unknown one", () => {
    expect(muscleGoalSchema.safeParse({ level: "focus" }).success).toBe(true);
    expect(muscleGoalSchema.safeParse({ level: "custom", min: 5, max: 5 }).success).toBe(true);
    expect(muscleGoalSchema.safeParse({ level: "custom", min: 12, max: 8 }).success).toBe(false);
    expect(muscleGoalSchema.safeParse({ level: "custom", min: 1 }).success).toBe(false);
    expect(muscleGoalsSchema.safeParse({ chest: { level: "grow" } }).success).toBe(true);
    expect(muscleGoalsSchema.safeParse({ neck: { level: "grow" } }).success).toBe(false);
  });

  it("targets twelve muscles and not cardio", () => {
    expect(TARGET_MUSCLES).toHaveLength(12);
    expect(isTargetMuscle("chest")).toBe(true);
    expect(isTargetMuscle("cardio")).toBe(false);
  });
});
