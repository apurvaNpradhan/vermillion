import { describe, expect, it } from "vitest";
import { createExerciseMatcher, type ImportedSession, type LibraryEntry } from "@workspace/shared";

import {
  NEW_EXERCISE_PREFIX,
  collectNames,
  createResolver,
  matchNames,
  newExerciseInput,
  type Resolution,
} from "./import-names";

const set = (reps: number | null, weight: number | null = null) => ({
  kind: "working" as const,
  weight,
  reps,
  durationS: null,
  distanceM: null,
  rpe: null,
});

function session(key: string, ...exercises: [string, ReturnType<typeof set>[]][]): ImportedSession {
  return {
    key,
    title: key,
    start: { year: 2026, month: 3, day: 2, hour: 10, minute: 0, second: 0 },
    durationS: null,
    note: null,
    exercises: exercises.map(([name, sets]) => ({ name, note: null, supersetKey: null, sets })),
  };
}

const library: LibraryEntry[] = [
  {
    id: "bench",
    title: "Bench Press (Barbell)",
    aka: null,
    custom: false,
    exerciseType: "weight_reps",
  },
];
const byId = new Map(library.map((entry) => [entry.id, entry]));

describe("collectNames", () => {
  it("counts workouts and sets per normalized name, most used first", () => {
    const names = collectNames([
      session("a", ["Bench Press (Barbell)", [set(5, 60), set(5, 60)]], ["Pull Up", [set(8)]]),
      session("b", ["bench press barbell", [set(5, 62)]]),
    ]);
    expect(names.map((use) => [use.name, use.sessions, use.sets])).toEqual([
      ["Bench Press (Barbell)", 2, 3],
      ["Pull Up", 1, 1],
    ]);
  });
});

describe("resolving names", () => {
  const sessions = [
    session(
      "a",
      ["Bench Press (Barbell)", [set(5, 60)]],
      ["Pull Up", [set(8)]],
      ["Zercher Squat", [set(5, 80)]],
    ),
  ];
  const matches = matchNames(collectNames(sessions), createExerciseMatcher(library), byId);

  it("matches by name and leaves the rest unmatched", () => {
    expect(matches.filter((match) => match.matched).map((match) => match.use.name)).toEqual([
      "Bench Press (Barbell)",
    ]);
  });

  it("creates unmatched names by default, with the type their sets suggest", () => {
    const resolve = createResolver(matches, new Map());
    expect(resolve("Bench Press (Barbell)")).toMatchObject({ exerciseId: "bench" });
    expect(resolve("Pull Up")).toMatchObject({
      exerciseId: `${NEW_EXERCISE_PREFIX}pull up`,
      type: "bodyweight_reps",
    });
    expect(resolve("Zercher Squat")?.type).toBe("weight_reps");
  });

  it("follows the user's mapping and skip", () => {
    const choices = new Map<string, Resolution>([
      [
        "pull up",
        { kind: "mapped", target: { exerciseId: "pu", title: "Pull Up", type: "bodyweight_reps" } },
      ],
      ["zercher squat", { kind: "skip" }],
    ]);
    const resolve = createResolver(matches, choices);
    expect(resolve("pull up")).toMatchObject({ exerciseId: "pu" });
    expect(resolve("Zercher Squat")).toBeNull();
  });

  it("builds the custom exercise to create", () => {
    const [, , zercher] = matches;
    expect(zercher && newExerciseInput(zercher.use)).toMatchObject({
      title: "Zercher Squat",
      exercise_type: "weight_reps",
      primary_muscle: "other",
      equipment: "other",
    });
  });
});
