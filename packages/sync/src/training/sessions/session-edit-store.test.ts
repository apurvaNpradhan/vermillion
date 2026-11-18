import { describe, expect, it } from "vitest";

import { CURL, SQUAT, pushWorkout, setupSessions, type Sessions } from "./session-fixtures";
import {
  addSessionExercises,
  leaveSessionSuperset,
  removeSet,
  replaceWarmups,
  restoreSet,
  tickSet,
  updateSet,
  supersetSessionWithNext,
  updateSessionExercise,
} from "./session-content-store";
import { setExerciseSetting } from "./equipment-store";
import { newSessionId, setDerivedTitle, startSession } from "./session-store";

const derivedTitle = "Workout";

function present<T>(value: T | null): T {
  if (value === null) throw new Error("expected a value");
  return value;
}

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

  const step = (weight_kg: number, reps = 5) =>
    ({ kind: "warmup", weight_kg, reps_min: reps, reps_max: reps }) as const;
  const hundred = [step(20, 10), step(50), step(70, 3), step(85, 1)];
  const bigger = [step(20, 10), step(55), step(77, 3), step(93.5, 1)];
  const loads = (s: Sessions, exerciseId: string) =>
    s
      .sets(exerciseId)
      .filter((row) => row["kind"] === "warmup")
      .map((row) => row["weight_kg"] ?? JSON.parse(String(row["target"])).weight_kg);

  it("keeps a typed middle warm-up in its slot and the sequence ascending", async () => {
    const s = await setupSessions();
    const t = await started(s);
    await replaceWarmups(s.training, t.squat, hundred);
    const third = String(s.sets(t.squat)[2]?.["id"]);
    await updateSet(s.training, third, { weight_kg: 75 });
    await replaceWarmups(s.training, t.squat, bigger);
    expect(loads(s, t.squat)).toEqual([20, 55, 75, 93.5]);
    expect(s.sets(t.squat)[2]).toMatchObject({ id: third, weight_kg: 75 });
  });

  it("keeps a ticked final warm-up and generates the steps below it", async () => {
    const s = await setupSessions();
    const t = await started(s);
    await replaceWarmups(s.training, t.squat, hundred);
    const last = String(s.sets(t.squat)[3]?.["id"]);
    await tickSet(s.training, last, { weight: 85, reps: 1 });
    await replaceWarmups(s.training, t.squat, bigger);
    expect(loads(s, t.squat)).toEqual([20, 55, 77, 85]);
    expect(s.sets(t.squat)[3]).toMatchObject({ id: last });
  });

  it("skips a generated step that would not fit between kept loads", async () => {
    const s = await setupSessions();
    const t = await started(s);
    await replaceWarmups(s.training, t.squat, hundred);
    await updateSet(s.training, String(s.sets(t.squat)[0]?.["id"]), { weight_kg: 60 });
    await replaceWarmups(s.training, t.squat, bigger);
    const rows = loads(s, t.squat);
    expect(rows).toEqual([60, 77, 93.5]);
    expect(rows).toEqual([...rows].sort((a, b) => a - b));
  });

  it("reuses the rows of the untouched warm-ups it regenerates", async () => {
    const s = await setupSessions();
    const t = await started(s);
    await replaceWarmups(s.training, t.squat, hundred);
    const ids = s.sets(t.squat).map((row) => row["id"]);
    await replaceWarmups(s.training, t.squat, bigger);
    expect(s.sets(t.squat).map((row) => row["id"])).toEqual(ids);
    expect(loads(s, t.squat)).toEqual([20, 55, 77, 93.5]);
  });

  it("marks generated rows and clears the mark when the user ticks or edits one", async () => {
    const s = await setupSessions();
    const t = await started(s);
    await replaceWarmups(s.training, t.squat, hundred);
    const [first, second, third] = s.sets(t.squat).map((row) => String(row["id"]));
    const marks = () => s.sets(t.squat).map((row) => row["generated_warmup"]);
    expect(marks()).toEqual([1, 1, 1, 1, 0, 0]);
    await tickSet(s.training, first ?? "", { weight: 20, reps: 10 });
    await updateSet(s.training, second ?? "", { reps: 6 });
    expect(marks()).toEqual([0, 0, 1, 1, 0, 0]);
    expect(await updateSet(s.training, third ?? "", { kind: "working" })).toBe(true);
    expect(s.one("session_set", third ?? "")).toMatchObject({ generated_warmup: 0 });
  });

  describe("automatic", () => {
    const auto = (s: Sessions, exerciseId: string, key: string, ramp = hundred) =>
      replaceWarmups(s.training, exerciseId, ramp, s.installId, { key, auto: true });

    it("writes the ramp once per key and stores the key with the exercise", async () => {
      const s = await setupSessions();
      const t = await started(s);
      await setExerciseSetting(s.training, SQUAT, { auto_warmups: true });
      expect(await auto(s, t.squat, "k1")).toBe(true);
      expect(s.one("session_exercise", t.squat)).toMatchObject({ warmup_key: "k1" });
      // The user deletes one; the same inputs must not bring it back.
      await removeSet(s.training, String(s.sets(t.squat)[1]?.["id"]));
      expect(await auto(s, t.squat, "k1")).toBe(false);
      expect(loads(s, t.squat)).toEqual([20, 70, 85]);
      expect(await auto(s, t.squat, "k2", bigger)).toBe(true);
    });

    it("refuses when a set was ticked, the session is finished or another device has it", async () => {
      const s = await setupSessions();
      const t = await started(s);
      await setExerciseSetting(s.training, SQUAT, { auto_warmups: true });
      await tickSet(s.training, String(s.sets(t.squat)[0]?.["id"]), { weight: 40, reps: 10 });
      expect(await auto(s, t.squat, "k1")).toBe(false);
      expect(s.one("session_exercise", t.squat)).toMatchObject({ warmup_key: null });

      const u = await setupSessions();
      const v = await started(u);
      await setExerciseSetting(u.training, SQUAT, { auto_warmups: true });
      u.sqlite
        .prepare("UPDATE training_session SET device_id = 'other-device' WHERE id = ?")
        .run(v.id);
      expect(await auto(u, v.squat, "k1")).toBe(false);
      u.sqlite
        .prepare("UPDATE training_session SET device_id = ?, finished_at = ? WHERE id = ?")
        .run(u.installId, "2026-11-18T10:00:00Z", v.id);
      expect(await auto(u, v.squat, "k1")).toBe(false);
    });

    it("refuses when the exercise's Auto warm-ups is off", async () => {
      const s = await setupSessions();
      const t = await started(s);
      expect(await auto(s, t.squat, "k1")).toBe(false);
    });
  });

  describe("Undo of a removed generated warm-up", () => {
    it("restores it when nothing was regenerated", async () => {
      const s = await setupSessions();
      const t = await started(s);
      await replaceWarmups(s.training, t.squat, hundred);
      const removed = await removeSet(s.training, String(s.sets(t.squat)[1]?.["id"]));
      expect(await restoreSet(s.training, present(removed))).toBe(true);
      expect(loads(s, t.squat)).toEqual([20, 50, 70, 85]);
    });

    it("does not restore a duplicate once regeneration filled the slot", async () => {
      const s = await setupSessions();
      const t = await started(s);
      await replaceWarmups(s.training, t.squat, hundred);
      const removed = await removeSet(s.training, String(s.sets(t.squat)[1]?.["id"]));
      await replaceWarmups(s.training, t.squat, hundred);
      expect(loads(s, t.squat)).toEqual([20, 50, 70, 85]);
      expect(await restoreSet(s.training, present(removed))).toBe(false);
      expect(loads(s, t.squat)).toEqual([20, 50, 70, 85]);
    });
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
