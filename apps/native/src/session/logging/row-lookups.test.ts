import type { Ghosts, LoggedSet } from "@workspace/shared";
import type { SessionExerciseDetail } from "@workspace/sync";
import { describe, expect, it } from "vitest";

import { nextRowLookups, shareMapValues } from "./row-lookups";

const exercise = (id: string, setIds: string[]): SessionExerciseDetail => ({
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
  sets: setIds.map((setId) => ({
    id: setId,
    position: setId,
    kind: "working",
    weightKg: null,
    reps: null,
    durationS: null,
    distanceM: null,
    floors: null,
    steps: null,
    rpe: null,
    completedAt: null,
    timerStartedAt: null,
    target: null,
    generatedWarmup: false,
  })),
});

const exercises = [exercise("a", ["a1", "a2"]), exercise("b", ["b1"])];
const none = (): LoggedSet | null => null;

describe("nextRowLookups", () => {
  it("keeps an exercise's lookups while its rows return the same values", () => {
    const ghosts = (weight: number) => (): Ghosts => ({ weight });
    const first = nextRowLookups(new Map(), exercises, none, ghosts(60));
    const second = nextRowLookups(first, exercises, none, (id) =>
      id === "b1" ? { weight: 70 } : { weight: 60 },
    );
    expect(second.get("a")).toBe(first.get("a"));
    expect(second.get("b")).not.toBe(first.get("b"));
    expect(second.get("b")?.ghostsFor("b1")).toEqual({ weight: 70 });
    expect(second.get("a")?.ghostsFor("missing")).toEqual({});
  });
});

describe("shareMapValues", () => {
  it("returns the previous map when every value is equal", () => {
    const before = new Map([["a", { x: 1 }]]);
    expect(shareMapValues(before, new Map([["a", { x: 1 }]]))).toBe(before);
  });

  it("keeps equal values and takes changed ones", () => {
    const kept = { x: 1 };
    const after = shareMapValues(
      new Map([
        ["a", kept],
        ["b", { x: 2 }],
      ]),
      new Map([
        ["a", { x: 1 }],
        ["b", { x: 3 }],
      ]),
    );
    expect(after.get("a")).toBe(kept);
    expect(after.get("b")).toEqual({ x: 3 });
  });
});
