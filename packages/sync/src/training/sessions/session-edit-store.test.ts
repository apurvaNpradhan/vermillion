import { describe, expect, it } from "vitest";

import { CURL, pushWorkout, setupSessions, type Sessions } from "./session-fixtures";
import {
  addSessionExercises,
  leaveSessionSuperset,
  replaceWarmups,
  tickSet,
  updateSet,
  supersetSessionWithNext,
  updateSessionExercise,
} from "./session-content-store";
import { newSessionId, setDerivedTitle, startSession } from "./session-store";

const derivedTitle = "Workout";

async function started(s: Sessions, title: string | null = "Legs") {
  const plan = await pushWorkout(s, title);
  const id = await startSession(s.training, { workoutId: plan.workoutId, derivedTitle });
  const [squat, plank] = s.exercises(id).map((row) => String(row["id"]));
  return { id, squat: squat ?? "", plank: plank ?? "" };
}

describe("updateSessionExercise", () => {
  it("writes only what changed: note, rest and the effort column", async () => {
    const s = await setupSessions();
    const t = await started(s);
    expect(await updateSessionExercise(s.training, t.squat, { note: "Seat 4" })).toBe(true);
    expect(await updateSessionExercise(s.training, t.squat, { note: "Seat 4" })).toBe(false);
    expect(await updateSessionExercise(s.training, t.squat, { log_effort: false })).toBe(true);
    expect(await updateSessionExercise(s.training, t.squat, { rest_seconds: null })).toBe(true);
    expect(s.one("session_exercise", t.squat)).toMatchObject({
      note: "Seat 4",
      log_effort: 0,
      rest_seconds: null,
    });
    expect(await updateSessionExercise(s.training, "missing", { note: "x" })).toBe(false);
  });

  it("refuses a note over the limit and a rest over ten minutes", async () => {
    const s = await setupSessions();
    const t = await started(s);
    await expect(
      updateSessionExercise(s.training, t.squat, { note: "x".repeat(1001) }),
    ).rejects.toThrow();
    await expect(
      updateSessionExercise(s.training, t.squat, { rest_seconds: 601 }),
    ).rejects.toThrow();
  });
});

describe("supersets in a Session", () => {
  it("joins an exercise with the next one, rest staying on the last member", async () => {
    const s = await setupSessions();
    const t = await started(s);
    await updateSessionExercise(s.training, t.squat, { rest_seconds: 90 });
    await updateSessionExercise(s.training, t.plank, { rest_seconds: 60 });
    expect(await supersetSessionWithNext(s.training, t.squat)).toBe(true);
    const [first, second] = s.exercises(t.id);
    expect(first?.["superset_group"]).toEqual(expect.any(String));
    expect(first?.["superset_group"]).toBe(second?.["superset_group"]);
    expect(first?.["rest_seconds"]).toBeNull();
    expect(second?.["rest_seconds"]).toBe(60);
    // Already together, or no next exercise: nothing to write.
    expect(await supersetSessionWithNext(s.training, t.squat)).toBe(false);
    expect(await supersetSessionWithNext(s.training, t.plank)).toBe(false);
  });

  it("leaves a superset: a group of one is cleared and the last member keeps the rest", async () => {
    const s = await setupSessions();
    const t = await started(s);
    await supersetSessionWithNext(s.training, t.squat);
    expect(await leaveSessionSuperset(s.training, t.squat)).toBe(true);
    const rows = s.exercises(t.id);
    expect(rows.map((row) => row["superset_group"])).toEqual([null, null]);
    expect(rows[0]?.["rest_seconds"]).not.toBeNull();
    expect(await leaveSessionSuperset(s.training, t.squat)).toBe(false);
  });

  it("builds a circuit of three from consecutive exercises", async () => {
    const s = await setupSessions();
    const t = await started(s);
    const [curl] = await addSessionExercises(s.training, t.id, [CURL]);
    await supersetSessionWithNext(s.training, t.squat);
    await supersetSessionWithNext(s.training, t.plank);
    const groups = s.exercises(t.id).map((row) => row["superset_group"]);
    expect(new Set(groups).size).toBe(1);
    expect(groups).toHaveLength(3);
    expect(s.one("session_exercise", curl ?? "")?.["rest_seconds"]).not.toBeNull();
    expect(s.one("session_exercise", t.squat)?.["rest_seconds"]).toBeNull();
    expect(s.one("session_exercise", t.plank)?.["rest_seconds"]).toBeNull();
  });
});

describe("setDerivedTitle", () => {
  it("renames a derived title only, and keeps it derived", async () => {
    const s = await setupSessions();
    const empty = await startSession(s.training, { workoutId: null, derivedTitle });
    expect(await setDerivedTitle(s.training, empty, "Quadriceps")).toBe(true);
    expect(await setDerivedTitle(s.training, empty, "Quadriceps")).toBe(false);
    expect(s.one("training_session", empty)).toMatchObject({
      title: "Quadriceps",
      title_derived: 1,
    });
    const named = await started(s, "Legs");
    expect(await setDerivedTitle(s.training, named.id, "Chest")).toBe(false);
    expect(s.one("training_session", named.id)).toMatchObject({ title: "Legs" });
    await expect(setDerivedTitle(s.training, empty, "  ")).rejects.toThrow();
    await expect(setDerivedTitle(s.training, "missing", "Chest")).rejects.toThrow(
      "session is gone",
    );
  });
});

describe("newSessionId", () => {
  it("makes UUIDv7 ids that start a Session once", async () => {
    const s = await setupSessions();
    const id = newSessionId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    await startSession(s.training, { workoutId: null, derivedTitle }, { id });
    await startSession(s.training, { workoutId: null, derivedTitle }, { id });
    expect(s.all("training_session")).toHaveLength(1);
  });
});

describe("replaceWarmups", () => {
  const ramp = [
    { kind: "warmup", weight_kg: 20, reps_min: 10, reps_max: 10 },
    { kind: "warmup", weight_kg: 50, reps_min: 5, reps_max: 5 },
    { kind: "warmup", weight_kg: 85, reps_min: 1, reps_max: 1 },
  ] as const;
  const rowsOf = (s: Sessions, exerciseId: string) =>
    s
      .sets(exerciseId)
      .map((row) => [
        row["kind"],
        JSON.parse(String(row["target"]))?.weight_kg,
        row["completed_at"] === null ? "open" : "done",
      ]);

  it("replaces the planned warm-up and puts the ramp before the working sets", async () => {
    const s = await setupSessions();
    const t = await started(s);
    expect(await replaceWarmups(s.training, t.squat, ramp)).toBe(true);
    expect(rowsOf(s, t.squat)).toEqual([
      ["warmup", 20, "open"],
      ["warmup", 50, "open"],
      ["warmup", 85, "open"],
      ["working", 100, "open"],
      ["working", 100, "open"],
    ]);
    // Generated rows are plain warm-ups with no actual values: Ghost values come from the target.
    expect(s.sets(t.squat)[0]).toMatchObject({ weight_kg: null, reps: null, completed_at: null });
  });

  it("writes nothing when the rows already match", async () => {
    const s = await setupSessions();
    const t = await started(s);
    await replaceWarmups(s.training, t.squat, ramp);
    const ids = s.sets(t.squat).map((row) => row["id"]);
    expect(await replaceWarmups(s.training, t.squat, ramp)).toBe(false);
    expect(s.sets(t.squat).map((row) => row["id"])).toEqual(ids);
  });

  it("regenerates the untouched rows when the ramp changes", async () => {
    const s = await setupSessions();
    const t = await started(s);
    await replaceWarmups(s.training, t.squat, ramp);
    await replaceWarmups(s.training, t.squat, [ramp[0], { ...ramp[1], weight_kg: 60 }]);
    expect(rowsOf(s, t.squat).map((row) => row[1])).toEqual([20, 60, 100, 100]);
  });

  it("never touches a ticked or edited warm-up and only adds the steps after them", async () => {
    const s = await setupSessions();
    const t = await started(s);
    await replaceWarmups(s.training, t.squat, ramp);
    const [first, second] = s.sets(t.squat).map((row) => String(row["id"]));
    await tickSet(s.training, first ?? "", { weight: 20, reps: 10 });
    await updateSet(s.training, second ?? "", { weight_kg: 55 });
    expect(
      await replaceWarmups(s.training, t.squat, [
        ramp[0],
        ramp[1],
        ramp[2],
        { kind: "warmup", weight_kg: 90, reps_min: 1, reps_max: 1 },
      ]),
    ).toBe(true);
    const rows = s.sets(t.squat);
    expect(rows[0]).toMatchObject({ id: first, weight_kg: 20, reps: 10 });
    expect(rows[0]?.["completed_at"]).not.toBeNull();
    expect(rows[1]).toMatchObject({ id: second, weight_kg: 55 });
    expect(rows.slice(2, 4).map((row) => JSON.parse(String(row["target"])).weight_kg)).toEqual([
      85, 90,
    ]);
    expect(rows.slice(4).map((row) => row["kind"])).toEqual(["working", "working"]);
  });

  it("removes the generated rows for an empty ramp and adds none past 20 sets", async () => {
    const s = await setupSessions();
    const t = await started(s);
    expect(await replaceWarmups(s.training, t.squat, [])).toBe(true);
    expect(rowsOf(s, t.squat).map((row) => row[0])).toEqual(["working", "working"]);
    const many = Array.from({ length: 30 }, (_, i) => ({
      kind: "warmup" as const,
      weight_kg: 10 + i,
      reps_min: 5,
      reps_max: 5,
    }));
    await replaceWarmups(s.training, t.squat, many);
    expect(s.sets(t.squat)).toHaveLength(20);
  });

  it("refuses a target the exercise type does not record", async () => {
    const s = await setupSessions();
    const t = await started(s);
    await expect(
      replaceWarmups(s.training, t.plank, [
        { kind: "warmup", weight_kg: 20, reps_min: 5, reps_max: 5 },
      ]),
    ).rejects.toThrow();
  });
});
