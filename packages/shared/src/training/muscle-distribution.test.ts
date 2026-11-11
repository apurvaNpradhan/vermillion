import { describe, expect, it } from "vitest";

import { muscleDistribution } from "./muscle-distribution";
import { loggedSet, untickedSet } from "./session-fixtures";

const exercises = [
  { id: "bench", primary_muscle: "chest", secondary_muscles: ["triceps", "shoulders"] },
  { id: "row", primary_muscle: "upper_back", secondary_muscles: ["biceps"] },
  { id: "fly", primary_muscle: "chest", secondary_muscles: [] },
] as const;

describe("muscleDistribution", () => {
  it.each(["top", "backoff", "myo"] as const)("counts %s like working sets", (kind) => {
    expect(muscleDistribution([loggedSet({ exercise_id: "bench", kind })], exercises)).toEqual([
      { muscle: "chest", sets: 1 },
      { muscle: "shoulders", sets: 0.5 },
      { muscle: "triceps", sets: 0.5 },
    ]);
    expect(muscleDistribution([untickedSet({ exercise_id: "bench", kind })], exercises)).toEqual(
      [],
    );
  });

  it("is empty without sets", () => {
    expect(muscleDistribution([], exercises)).toEqual([]);
  });

  it("adds 1 for the primary muscle and 0.5 for each secondary, ranked (ties by name)", () => {
    const sets = [
      loggedSet({ exercise_id: "bench" }),
      loggedSet({ exercise_id: "bench" }),
      loggedSet({ exercise_id: "row" }),
      loggedSet({ exercise_id: "fly" }),
    ];
    expect(muscleDistribution(sets, exercises)).toEqual([
      { muscle: "chest", sets: 3 },
      { muscle: "shoulders", sets: 1 },
      { muscle: "triceps", sets: 1 },
      { muscle: "upper_back", sets: 1 },
      { muscle: "biceps", sets: 0.5 },
    ]);
  });

  it("leaves out warm-ups, unticked sets and exercises it does not know", () => {
    const sets = [
      loggedSet({ exercise_id: "bench", kind: "warmup" }),
      untickedSet({ exercise_id: "bench" }),
      loggedSet({ exercise_id: "unknown" }),
      loggedSet({ exercise_id: "row", kind: "drop" }),
    ];
    expect(muscleDistribution(sets, exercises)).toEqual([
      { muscle: "upper_back", sets: 1 },
      { muscle: "biceps", sets: 0.5 },
    ]);
  });

  it("does not count a secondary muscle that is also the primary twice", () => {
    const odd = [
      { id: "x", primary_muscle: "chest", secondary_muscles: ["chest", "chest"] },
    ] as const;
    expect(muscleDistribution([loggedSet({ exercise_id: "x" })], odd)).toEqual([
      { muscle: "chest", sets: 1 },
    ]);
  });
});
