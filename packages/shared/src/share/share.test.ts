import { describe, expect, it } from "vitest";

import {
  normalizeShareCode,
  parseShareInput,
  SHARE_CODE_ALPHABET,
  shareCodeSchema,
  shareLinkUrl,
} from "./codes";
import { serializeProgram, serializeWorkout, type ShareExerciseSource } from "./serialize";
import {
  programSnapshotSchema,
  shareSnapshotSchema,
  snapshotKind,
  snapshotTitle,
  workoutSnapshotSchema,
} from "./snapshot";

const bench: ShareExerciseSource = {
  id: "0194a2d0-0000-7000-8000-000000000001",
  custom: false,
  title: "Bench Press",
  equipment: "barbell",
  exerciseType: "weight_reps",
  primaryMuscle: "chest",
  secondaryMuscles: ["triceps"],
};
const mine: ShareExerciseSource = {
  ...bench,
  id: "0194a2d0-0000-7000-8000-000000000002",
  custom: true,
  title: "My cable fly",
  equipment: "cable",
};

function push(id = "w1") {
  return {
    id,
    title: "Push",
    note: null,
    exercises: [
      {
        exercise: bench,
        restSeconds: 120,
        note: null,
        supersetGroup: "g-a",
        sets: [{ kind: "working" as const, reps_min: 5, reps_max: 5, weight_kg: 100 }],
      },
      {
        exercise: mine,
        restSeconds: null,
        note: "slow",
        supersetGroup: "g-a",
        sets: [{ kind: "working" as const, reps_min: 10, reps_max: 12 }],
      },
      {
        exercise: bench,
        restSeconds: null,
        note: null,
        supersetGroup: "lonely",
        sets: [],
      },
    ],
  };
}

describe("share codes", () => {
  it("has no look-alike characters", () => {
    expect(SHARE_CODE_ALPHABET).not.toMatch(/[01OIL]/);
    expect(new Set(SHARE_CODE_ALPHABET).size).toBe(SHARE_CODE_ALPHABET.length);
  });

  it("accepts six characters of the alphabet and nothing else", () => {
    expect(shareCodeSchema.safeParse("K7QM2X").success).toBe(true);
    for (const bad of ["K7QM2", "K7QM2XX", "K7QM20", "k7qm2x", "K7QM2L"]) {
      expect(shareCodeSchema.safeParse(bad).success, bad).toBe(false);
    }
  });

  it("normalizes what a person types", () => {
    expect(normalizeShareCode(" k7q-m2x ")).toBe("K7QM2X");
    expect(normalizeShareCode("K7QM2")).toBeNull();
    expect(normalizeShareCode("K7QM20")).toBeNull();
  });

  it("finds the code in a pasted link or a bare code", () => {
    expect(parseShareInput("https://sigil.lostsignal.cloud/p/k7qm2x")).toBe("K7QM2X");
    expect(parseShareInput("sigil.lostsignal.cloud/w/K7QM2X?x=1")).toBe("K7QM2X");
    expect(parseShareInput("K7QM2X")).toBe("K7QM2X");
    expect(parseShareInput("https://example.com/other")).toBeNull();
  });

  it("builds the link with the kind's path", () => {
    expect(shareLinkUrl("https://sigil.lostsignal.cloud/", "program", "K7QM2X")).toBe(
      "https://sigil.lostsignal.cloud/p/K7QM2X",
    );
    expect(shareLinkUrl("https://s.example", "workout", "K7QM2X")).toBe(
      "https://s.example/w/K7QM2X",
    );
  });
});

describe("snapshots", () => {
  it("serializes a workout that validates", () => {
    const snapshot = serializeWorkout(push(), { weights: true });
    expect(workoutSnapshotSchema.parse(snapshot)).toEqual(snapshot);
    expect(snapshotKind(snapshot)).toBe("workout");
    expect(snapshotTitle(snapshot)).toBe("Push");
  });

  it("references catalog exercises by id and describes custom ones by name", () => {
    const { workout } = serializeWorkout(push(), { weights: true });
    expect(workout.exercises[0]?.exercise.catalog_id).toBe(bench.id);
    expect(workout.exercises[1]?.exercise).toMatchObject({
      catalog_id: null,
      name: "My cable fly",
      equipment: "cable",
    });
  });

  it("renumbers supersets and drops groups of one", () => {
    const { workout } = serializeWorkout(push(), { weights: true });
    expect(workout.exercises.map((entry) => entry.superset)).toEqual([0, 0, null]);
  });

  it("leaves the weights out when asked", () => {
    const { workout } = serializeWorkout(push(), { weights: false });
    expect(workout.exercises[0]?.sets[0]).toEqual({ kind: "working", reps_min: 5, reps_max: 5 });
  });

  it("serializes a program with its rotation by index", () => {
    const snapshot = serializeProgram(
      {
        title: "PPL",
        description: null,
        plannedWeeks: 8,
        sessionsPerWeek: 3,
        workouts: [push("a"), push("b")],
        rotation: ["a", null, "b", "a"],
      },
      { weights: true },
    );
    expect(programSnapshotSchema.parse(snapshot).program.rotation).toEqual([0, null, 1, 0]);
    expect(shareSnapshotSchema.parse(snapshot).format).toBe("sigil.program/v1");
    expect(snapshotTitle(snapshot)).toBe("PPL");
  });

  it("refuses a rotation that points past the workouts", () => {
    const snapshot = serializeProgram(
      {
        title: "X",
        description: null,
        plannedWeeks: null,
        sessionsPerWeek: null,
        workouts: [],
        rotation: [],
      },
      { weights: true },
    );
    snapshot.program.rotation = [0];
    expect(programSnapshotSchema.safeParse(snapshot).success).toBe(false);
  });

  it("refuses an unknown format, unknown keys and fields the exercise type does not record", () => {
    const good = serializeWorkout(push(), { weights: true });
    expect(shareSnapshotSchema.safeParse({ ...good, format: "sigil.workout/v2" }).success).toBe(
      false,
    );
    expect(shareSnapshotSchema.safeParse({ ...good, extra: 1 }).success).toBe(false);
    const bad = structuredClone(good);
    const first = bad.workout.exercises[0];
    if (first) first.sets = [{ kind: "working", duration_s: 30 }];
    expect(shareSnapshotSchema.safeParse(bad).success).toBe(false);
  });
});
