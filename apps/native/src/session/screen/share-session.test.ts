import type { SessionDetail, SessionExerciseDetail, SessionSetDetail } from "@workspace/sync";
import { describe, expect, it } from "vitest";

import { shareSession } from "./share-session";

const set = (id: string, reps: number | null = null): SessionSetDetail => ({
  id,
  position: id,
  kind: "working",
  weightKg: 60,
  reps,
  durationS: null,
  distanceM: null,
  floors: null,
  steps: null,
  rpe: null,
  completedAt: null,
  timerStartedAt: null,
  target: null,
  generatedWarmup: false,
});

const exercise = (id: string, sets: SessionSetDetail[]): SessionExerciseDetail => ({
  id,
  exerciseId: `lib-${id}`,
  title: id,
  type: "weight_reps",
  sourceWorkoutExerciseId: null,
  position: id,
  restSeconds: null,
  note: null,
  pinnedNote: null,
  lastNote: null,
  supersetGroup: null,
  logEffort: false,
  progressionPerSet: false,
  autoWarmups: false,
  warmupKey: null,
  repeated: false,
  barId: null,
  exercise: null,
  sets,
});

const session = (exercises: SessionExerciseDetail[], title = "Upper"): SessionDetail => ({
  id: "s1",
  workoutId: null,
  workoutStructure: null,
  programId: null,
  runId: null,
  slotId: null,
  phase: null,
  phasePlan: null,
  cycle: null,
  title,
  titleDerived: false,
  note: null,
  workoutNote: null,
  startedAt: "2026-11-21T10:00:00.000Z",
  finishedAt: null,
  durationS: null,
  deviceId: "d1",
  rest: null,
  pausedAt: null,
  pausedMs: 0,
  exercises,
});

const build = (reps: number | null = null, title = "Upper") =>
  session(
    [exercise("a", [set("a1"), set("a2", reps)]), exercise("b", [set("b1"), set("b2")])],
    title,
  );

describe("shareSession", () => {
  it("returns the previous Session when nothing changed", () => {
    const before = build();
    expect(shareSession(before, build())).toBe(before);
  });

  it("keeps unchanged exercises and sets when one set changes", () => {
    const before = build();
    const after = shareSession(before, build(8));
    expect(after).not.toBe(before);
    expect(after.exercises[1]).toBe(before.exercises[1]);
    expect(after.exercises[0]).not.toBe(before.exercises[0]);
    expect(after.exercises[0]?.sets[0]).toBe(before.exercises[0]?.sets[0]);
    expect(after.exercises[0]?.sets[1]?.reps).toBe(8);
  });

  it("keeps every exercise when only a Session field changes", () => {
    const before = build();
    const after = shareSession(before, build(null, "Push"));
    expect(after.title).toBe("Push");
    expect(after.exercises).toBe(before.exercises);
  });

  it("follows a reorder without reusing stale positions", () => {
    const before = build();
    const next = build();
    const after = shareSession(before, { ...next, exercises: [...next.exercises].reverse() });
    expect(after.exercises.map((entry) => entry.id)).toEqual(["b", "a"]);
    expect(after.exercises[0]).toBe(before.exercises[1]);
  });

  it("starts afresh for another Session", () => {
    const before = build();
    const other = { ...build(), id: "s2" };
    expect(shareSession(before, other)).toBe(other);
  });
});
