import { describe, expect, it } from "vitest";

import { detailDistribution, muscleDistribution } from "./muscle-distribution";
import { loggedSet, untickedSet } from "../logging/session-fixtures";

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

describe("detailDistribution", () => {
  const detailed = [
    {
      id: "lateral",
      primary_muscle: "shoulders",
      secondary_muscles: [],
      primary_detail: ["side_delts"],
      secondary_detail: [],
    },
    {
      id: "ohp",
      primary_muscle: "shoulders",
      secondary_muscles: ["triceps"],
      primary_detail: ["front_delts", "side_delts"],
      secondary_detail: [],
    },
    {
      id: "facepull",
      primary_muscle: "upper_back",
      secondary_muscles: ["shoulders", "biceps"],
      primary_detail: ["mid_traps"],
      secondary_detail: ["rear_delts", "rotator_cuff"],
    },
    { id: "plain", primary_muscle: "shoulders", secondary_muscles: [] },
  ] as const;

  it("splits a group's sets over its details, the rest unspecified", () => {
    const sets = [
      loggedSet({ exercise_id: "lateral" }),
      loggedSet({ exercise_id: "ohp" }),
      loggedSet({ exercise_id: "facepull" }),
      loggedSet({ exercise_id: "plain" }),
    ];
    const split = detailDistribution(sets, detailed);
    expect(split.find((load) => load.muscle === "shoulders")?.parts).toEqual([
      { detail: "front_delts", sets: 0.5 },
      { detail: "side_delts", sets: 1.5 },
      { detail: "rear_delts", sets: 0.25 },
      { detail: "rotator_cuff", sets: 0.25 },
      { detail: "unspecified", sets: 1 },
    ]);
    // A secondary group whose secondary details are not listed is unspecified.
    expect(split.find((load) => load.muscle === "biceps")?.parts).toEqual([
      { detail: "unspecified", sets: 0.5 },
    ]);
  });

  it("adds up to the group totals of muscleDistribution", () => {
    const sets = [
      loggedSet({ exercise_id: "lateral" }),
      loggedSet({ exercise_id: "ohp" }),
      loggedSet({ exercise_id: "ohp" }),
      loggedSet({ exercise_id: "facepull" }),
      loggedSet({ exercise_id: "plain" }),
    ];
    const totals = muscleDistribution(sets, detailed);
    const split = detailDistribution(sets, detailed);
    expect(split.map((load) => load.muscle)).toEqual(totals.map((load) => load.muscle));
    for (const load of split) {
      const sum = load.parts.reduce((acc, part) => acc + part.sets, 0);
      expect(sum).toBeCloseTo(totals.find((total) => total.muscle === load.muscle)?.sets ?? -1);
    }
  });

  it("is all unspecified for rows without details", () => {
    const split = detailDistribution([loggedSet({ exercise_id: "bench" })], exercises);
    expect(split).toEqual([
      { muscle: "chest", parts: [{ detail: "unspecified", sets: 1 }] },
      { muscle: "shoulders", parts: [{ detail: "unspecified", sets: 0.5 }] },
      { muscle: "triceps", parts: [{ detail: "unspecified", sets: 0.5 }] },
    ]);
  });

  it("skips warm-ups and unticked sets", () => {
    const sets = [
      loggedSet({ exercise_id: "lateral", kind: "warmup" }),
      untickedSet({ exercise_id: "lateral" }),
    ];
    expect(detailDistribution(sets, detailed)).toEqual([]);
  });
});
