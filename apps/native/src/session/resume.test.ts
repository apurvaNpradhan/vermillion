import { describe, expect, it } from "vitest";

import { currentExercise } from "./resume";

const exercise = (id: string, group: string | null, ticks: boolean[]) => ({
  id,
  supersetGroup: group,
  sets: ticks.map((done, index) => ({ id: `${id}-${index}`, completedAt: done ? "t" : null })),
});

describe("currentExercise", () => {
  it("is the exercise of the first set still to log", () => {
    const list = [
      exercise("a", null, [true, true]),
      exercise("b", null, [true, false]),
      exercise("c", null, [false]),
    ];
    expect(currentExercise(list)?.id).toBe("b");
  });

  it("follows the rounds of a superset", () => {
    const list = [exercise("a", "g", [true, false]), exercise("b", "g", [false, false])];
    expect(currentExercise(list)?.id).toBe("b");
  });

  it("is the last exercise once everything is ticked, and null for none", () => {
    expect(currentExercise([exercise("a", null, [true]), exercise("b", null, [true])])?.id).toBe(
      "b",
    );
    expect(currentExercise([])).toBeNull();
  });
});
