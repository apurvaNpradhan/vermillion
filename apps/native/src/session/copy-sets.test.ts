import { describe, expect, it } from "vitest";
import type { SessionExerciseDetail, SessionSetDetail } from "@workspace/sync";
import { copySetUpdates } from "./copy-sets";

const set = (id: string, values: Partial<SessionSetDetail> = {}): SessionSetDetail => ({
  id,
  position: id,
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
  ...values,
});
const exercise = (
  sets: SessionSetDetail[],
  values: Partial<SessionExerciseDetail> = {},
): SessionExerciseDetail => ({
  id: "entry",
  exerciseId: "exercise",
  title: "Squat",
  type: "weight_reps",
  sourceWorkoutExerciseId: null,
  position: "a",
  restSeconds: null,
  note: null,
  supersetGroup: null,
  logEffort: true,
  exercise: null,
  sets,
  ...values,
});

describe("copying set values", () => {
  it("copies the row above without copying completion, kind or timer", () => {
    const row = exercise([
      set("a", { weightKg: 50, reps: 8, rpe: 8, completedAt: "done", timerStartedAt: "running" }),
      set("b"),
    ]);
    expect(copySetUpdates(row, "b", "previous", { weight_kg: 99 })).toEqual([
      { id: "b", patch: { weight_kg: 50, reps: 8, rpe: 8 } },
    ]);
  });
  it("uses session history only for the first row and hides unavailable copies", () => {
    const row = exercise([set("a"), set("b")]);
    expect(copySetUpdates(row, "a", "previous", { weight_kg: 0, reps: 10 })).toEqual([
      { id: "a", patch: { weight_kg: 0, reps: 10 } },
    ]);
    expect(copySetUpdates(row, "a", "previous", null)).toEqual([]);
    expect(copySetUpdates(row, "b", "previous", { reps: 10 })).toEqual([]);
    expect(copySetUpdates(row, "missing", "remaining", null)).toEqual([]);
  });
  it("fills only later unfinished rows, preserving existing fields absent from the source", () => {
    const row = exercise([
      set("a", { weightKg: 60 }),
      set("b", { completedAt: "done" }),
      set("c", { reps: 8 }),
      set("d"),
    ]);
    expect(copySetUpdates(row, "a", "remaining", null)).toEqual([
      { id: "c", patch: { weight_kg: 60 } },
      { id: "d", patch: { weight_kg: 60 } },
    ]);
    expect(copySetUpdates(row, "d", "remaining", null)).toEqual([]);
  });
  it("copies duration and distance for cardio and omits effort", () => {
    const row = exercise([set("a", { durationS: 60, distanceM: 200, rpe: 9 }), set("b")], {
      type: "distance_duration",
    });
    expect(copySetUpdates(row, "a", "remaining", null)).toEqual([
      { id: "b", patch: { duration_s: 60, distance_m: 200 } },
    ]);
  });
  it("does not add effort to warmups", () => {
    const row = exercise([set("a", { reps: 5, rpe: 9 }), set("b", { kind: "warmup" })]);
    expect(copySetUpdates(row, "b", "previous", null)).toEqual([
      { id: "b", patch: { reps: 5, rpe: null } },
    ]);
  });
});
