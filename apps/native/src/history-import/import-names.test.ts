import { describe, expect, it } from "vitest";
import { createExerciseMatcher, type ImportedSession, type LibraryEntry } from "@workspace/shared";

import {
  NEW_EXERCISE_PREFIX,
  applyRememberedMappings,
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
    format: "strong",
    startedAt: "2026-03-02T10:00:00.000Z",
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

it("reuses a manual mapping with the library's current title and ignores retired targets", () => {
  const names = collectNames([session("a", ["Bench Press (Barbell)", [set(5, 60)]])]);
  const matches = matchNames(names, createExerciseMatcher(library), byId);
  const target: LibraryEntry = {
    id: "manual",
    title: "Updated bench",
    aka: null,
    custom: true,
    exerciseType: "bodyweight_reps",
  };
  const current = new Map(byId).set(target.id, target);
  const remembered = applyRememberedMappings(matches, current, (key) =>
    key === "bench press barbell" ? target.id : null,
  );
  expect(
    createResolver(remembered.matches, remembered.resolutions)("Bench Press (Barbell)"),
  ).toEqual({ exerciseId: "manual", title: "Updated bench", type: "bodyweight_reps" });
  const retired = applyRememberedMappings(matches, byId, () => target.id);
  expect(
    createResolver(retired.matches, retired.resolutions)("Bench Press (Barbell)")?.exerciseId,
  ).toBe("bench");
});
