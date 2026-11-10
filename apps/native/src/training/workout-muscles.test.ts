import { describe, expect, it } from "vitest";

import { workoutMuscles } from "./workout-muscles";

describe("whole-workout muscle coverage", () => {
  it("uses every exercise and distinguishes direct from assisting muscles", () => {
    const exercises = [
      {
        primaryMuscle: "chest" as const,
        secondaryMuscles: ["triceps" as const, "shoulders" as const],
      },
      { primaryMuscle: "triceps" as const, secondaryMuscles: ["chest" as const] },
      { primaryMuscle: "hamstrings" as const, secondaryMuscles: ["glutes" as const] },
    ];
    const result = workoutMuscles(exercises);
    expect(result.primary).toEqual(expect.arrayContaining(["chest", "triceps", "hamstrings"]));
    expect(result.secondary).toEqual(expect.arrayContaining(["shoulders", "glutes"]));
    expect(result.secondary).not.toContain("triceps");
    expect(workoutMuscles([...exercises].reverse())).toEqual(result);
  });
  it("handles an empty workout and exercises still arriving through sync", () => {
    expect(workoutMuscles([])).toEqual({ primary: [], secondary: [] });
    expect(workoutMuscles([{ primaryMuscle: null }])).toEqual({ primary: [], secondary: [] });
  });
});
