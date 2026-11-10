import { SESSION_LIMITS } from "@workspace/shared";
import { describe, expect, it } from "vitest";

import {
  CURL,
  DIP,
  PLANK,
  PUSHUP,
  SQUAT,
  pushWorkout,
  setupSessions,
  type Sessions,
} from "./session-fixtures";
import {
  addSessionExercises,
  addSet,
  moveSessionExercise,
  removeSessionExercise,
  removeSet,
  replaceSessionExercise,
  tickSet,
  untickSet,
  updateSet,
} from "./session-content-store";
import { SessionLimitError } from "./session-common";
import {
  adjustRest,
  clearRest,
  discardSession,
  finishSession,
  logPastSession,
  restoreSession,
  startRest,
  startSession,
  takeOver,
} from "./session-store";
import { setExerciseSetting, upsertEquipment } from "./equipment-store";

const derivedTitle = "Quadriceps";

async function started(s: Sessions) {
  const plan = await pushWorkout(s);
  const id = await startSession(s.training, { workoutId: plan.workoutId, derivedTitle });
  const [squat, plank] = s.exercises(id).map((row) => String(row["id"]));
  const [warmup, work1, work2] = s.sets(squat ?? "").map((row) => String(row["id"]));
  return {
    ...plan,
    id,
    squat: squat ?? "",
    plank: plank ?? "",
    warmup: warmup ?? "",
    work1: work1 ?? "",
    work2: work2 ?? "",
  };
}

describe("startSession", () => {
  it("copies the Workout: title, exercise snapshots, positions, rest and unticked sets with targets", async () => {
    const s = await setupSessions();
    const plan = await pushWorkout(s, "Legs");
    const id = await startSession(s.training, { workoutId: plan.workoutId, derivedTitle });
    expect(s.one("training_session", id)).toMatchObject({
      user_id: "owner",
      workout_id: plan.workoutId,
      program_id: null,
      title: "Legs",
      title_derived: 0,
      finished_at: null,
      device_id: s.installId,
      rest_set_id: null,
    });
    const rows = s.exercises(id);
    expect(rows.map((row) => row["exercise_title"])).toEqual(["Squat", "Plank"]);
    expect(rows.map((row) => row["exercise_type"])).toEqual(["weight_reps", "duration"]);
    expect(rows[0]).toMatchObject({
      source_workout_exercise_id: plan.squat,
      user_id: "owner",
      log_effort: 1,
    });
    expect(rows[1]).toMatchObject({ log_effort: 0 });
    const squatSets = s.sets(String(rows[0]?.["id"]));
    expect(squatSets.map((row) => row["kind"])).toEqual(["warmup", "working", "working"]);
    for (const row of squatSets) {
      expect(row).toMatchObject({
        completed_at: null,
        weight_kg: null,
        reps: null,
        user_id: "owner",
      });
    }
    expect(JSON.parse(String(squatSets[1]?.["target"]))).toEqual({
      kind: "working",
      reps_min: 5,
      reps_max: 8,
      weight_kg: 100,
      effort_min: 8,
      effort_max: 8,
    });
    const positions = squatSets.map((row) => String(row["position"]));
    expect(positions).toEqual(positions.toSorted());
  });

  it("names a derived or empty Session from the caller's title", async () => {
    const s = await setupSessions();
    const plan = await pushWorkout(s, null);
    const derived = await startSession(s.training, { workoutId: plan.workoutId, derivedTitle });
    expect(s.one("training_session", derived)).toMatchObject({
      title: derivedTitle,
      title_derived: 1,
    });
    const empty = await startSession(s.training, { workoutId: null, derivedTitle: "Workout" });
    expect(s.one("training_session", empty)).toMatchObject({
      title: "Workout",
      title_derived: 1,
      workout_id: null,
    });
    expect(s.exercises(empty)).toEqual([]);
    await expect(startSession(s.training, { workoutId: "missing", derivedTitle })).rejects.toThrow(
      "workout is gone",
    );
  });

  it("turns the effort column on from the exercise's setting", async () => {
    const s = await setupSessions();
    const plan = await pushWorkout(s);
    await setExerciseSetting(s.training, PLANK, { log_effort: true });
    const id = await startSession(s.training, { workoutId: plan.workoutId, derivedTitle });
    expect(s.exercises(id).map((row) => row["log_effort"])).toEqual([1, 1]);
  });

  it("is idempotent for one id and never refuses a second active Session", async () => {
    const s = await setupSessions();
    const plan = await pushWorkout(s);
    const source = { workoutId: plan.workoutId, derivedTitle };
    const first = await startSession(s.training, source, {
      id: "0192f0a0-0000-7000-8000-0000000000a1",
    });
    expect(await startSession(s.training, source, { id: first })).toBe(first);
    expect(s.all("training_session")).toHaveLength(1);
    expect(s.all("session_exercise")).toHaveLength(2);
    const second = await startSession(s.training, source);
    expect(second).not.toBe(first);
    expect(s.all("training_session")).toHaveLength(2);
  });

  it("refuses a stale install and a device without an owner", async () => {
    const s = await setupSessions();
    await expect(
      startSession(s.training, { workoutId: null, derivedTitle }, {}, "another"),
    ).rejects.toThrow("device account changed");
  });
});

describe("tickSet and untickSet", () => {
  it("adopts Ghosts into empty cells and writes one row", async () => {
    const s = await setupSessions();
    const t = await started(s);
    const before = {
      sets: s.all("session_set"),
      session: s.all("training_session"),
      exercises: s.all("session_exercise"),
    };
    const result = await tickSet(s.training, t.work1, { weight: 100, reps: 5, rpe: 8 });
    expect(result).toEqual({ ok: true, wrote: true, values: { weight_kg: 100, reps: 5, rpe: 8 } });
    const ticked = s.one("session_set", t.work1);
    expect(ticked).toMatchObject({ weight_kg: 100, reps: 5, rpe: 8 });
    expect(ticked?.["completed_at"]).toEqual(expect.any(String));
    // Nothing else changed: not another set, not the Session, not the exercises.
    const after = s.all("session_set");
    expect(
      after.filter((row, index) => JSON.stringify(row) !== JSON.stringify(before.sets[index])),
    ).toHaveLength(1);
    expect(s.all("training_session")).toEqual(before.session);
    expect(s.all("session_exercise")).toEqual(before.exercises);
  });

  it("keeps typed values over Ghosts and refuses a set with a missing required value", async () => {
    const s = await setupSessions();
    const t = await started(s);
    await updateSet(s.training, t.work1, { weight_kg: 102.5 });
    expect(await tickSet(s.training, t.work1, { weight: 100, reps: 5 })).toMatchObject({
      ok: true,
      values: { reps: 5 },
    });
    expect(s.one("session_set", t.work1)).toMatchObject({ weight_kg: 102.5, reps: 5 });

    expect(await tickSet(s.training, t.work2, { weight: 100 })).toEqual({
      ok: false,
      missing: ["reps"],
    });
    expect(s.one("session_set", t.work2)).toMatchObject({ completed_at: null, weight_kg: null });
    expect(await tickSet(s.training, t.work2, {})).toEqual({
      ok: false,
      missing: ["weight", "reps"],
    });
    // A weight of 0 is a value; 0 reps is not.
    await updateSet(s.training, t.work2, { weight_kg: 0 });
    expect(await tickSet(s.training, t.work2, { reps: 0 })).toEqual({
      ok: false,
      missing: ["reps"],
    });
  });

  it("is idempotent, stops a running timer and unticks keeping the values", async () => {
    const s = await setupSessions();
    const t = await started(s);
    await tickSet(s.training, t.work1, { weight: 100, reps: 5 });
    const at = s.one("session_set", t.work1)?.["completed_at"];
    expect(await tickSet(s.training, t.work1, { weight: 1, reps: 1 })).toEqual({
      ok: true,
      wrote: false,
      values: {},
    });
    expect(s.one("session_set", t.work1)).toMatchObject({ completed_at: at, weight_kg: 100 });

    const plank = s.sets(t.plank)[0];
    const plankSet = String(plank?.["id"]);
    await updateSet(s.training, plankSet, { timer_started_at: new Date().toISOString() });
    expect(await tickSet(s.training, plankSet, { duration: 30 })).toMatchObject({ ok: true });
    expect(s.one("session_set", plankSet)).toMatchObject({
      duration_s: 30,
      timer_started_at: null,
    });

    expect(await untickSet(s.training, t.work1)).toBe(true);
    expect(s.one("session_set", t.work1)).toMatchObject({
      completed_at: null,
      weight_kg: 100,
      reps: 5,
    });
    expect(await untickSet(s.training, t.work1)).toBe(false);
    await expect(tickSet(s.training, "missing", {})).rejects.toThrow("set is gone");
  });

  it("cancels the Rest that the unticked set started, and only that one", async () => {
    const s = await setupSessions();
    const t = await started(s);
    await tickSet(s.training, t.work1, { weight: 100, reps: 5 });
    await tickSet(s.training, t.work2, { weight: 100, reps: 5 });
    await startRest(s.training, t.id, t.work2, 120);
    await untickSet(s.training, t.work1);
    expect(s.one("training_session", t.id)).toMatchObject({ rest_set_id: t.work2 });
    await untickSet(s.training, t.work2);
    expect(s.one("training_session", t.id)).toMatchObject({
      rest_set_id: null,
      rest_started_at: null,
      rest_ends_at: null,
    });
  });

  it("works for every exercise type", async () => {
    const s = await setupSessions();
    const id = await startSession(s.training, { workoutId: null, derivedTitle });
    const [pushup, dip, plank] = await addSessionExercises(s.training, id, [PUSHUP, DIP, PLANK]);
    const first = (exerciseId: string | undefined) => String(s.sets(exerciseId ?? "")[0]?.["id"]);
    expect(await tickSet(s.training, first(pushup), { reps: 8 })).toMatchObject({ ok: true });
    expect(await tickSet(s.training, first(dip), { reps: 8 })).toEqual({
      ok: false,
      missing: ["weight"],
    });
    expect(await tickSet(s.training, first(dip), { weight: 20, reps: 8 })).toMatchObject({
      ok: true,
    });
    expect(await tickSet(s.training, first(plank), { duration: 30 })).toMatchObject({ ok: true });
  });
});

describe("sets", () => {
  it("adds, edits dirty fields only and refuses what the type does not record", async () => {
    const s = await setupSessions();
    const t = await started(s);
    const id = await addSet(s.training, t.squat, { weight_kg: 60, kind: "drop" });
    expect(s.one("session_set", id)).toMatchObject({
      kind: "drop",
      weight_kg: 60,
      completed_at: null,
      target: null,
    });
    const positions = s.sets(t.squat).map((row) => String(row["position"]));
    expect(positions).toEqual([...positions].sort());
    expect(await updateSet(s.training, id, { weight_kg: 60 })).toBe(false);
    expect(await updateSet(s.training, id, { weight_kg: 62.5, rpe: 8.5 })).toBe(true);
    expect(await updateSet(s.training, "missing", { reps: 1 })).toBe(false);
    await expect(addSet(s.training, t.squat, { duration_s: 30 })).rejects.toThrow();
    await expect(updateSet(s.training, id, { reps: 0 })).rejects.toThrow();
    await expect(updateSet(s.training, id, { rpe: 5 as never })).rejects.toThrow();
    await expect(addSet(s.training, t.plank, { reps: 5 })).rejects.toThrow();
    await expect(addSet(s.training, t.plank, { rpe: 8 })).rejects.toThrow();
  });

  it("keeps a ticked set valid", async () => {
    const s = await setupSessions();
    const t = await started(s);
    await tickSet(s.training, t.work1, { weight: 100, reps: 5 });
    await expect(updateSet(s.training, t.work1, { reps: null })).rejects.toThrow();
    expect(await updateSet(s.training, t.work1, { reps: 6 })).toBe(true);
  });

  it("holds at most 20 sets per exercise", async () => {
    const s = await setupSessions();
    const t = await started(s);
    const have = s.sets(t.squat).length;
    for (let index = have; index < SESSION_LIMITS.setsPerExercise; index += 1) {
      await addSet(s.training, t.squat);
    }
    await expect(addSet(s.training, t.squat)).rejects.toBeInstanceOf(SessionLimitError);
    expect(s.sets(t.squat)).toHaveLength(SESSION_LIMITS.setsPerExercise);
  });

  it("removes a set and cancels its Rest", async () => {
    const s = await setupSessions();
    const t = await started(s);
    await tickSet(s.training, t.work1, { weight: 100, reps: 5 });
    await startRest(s.training, t.id, t.work1, 90);
    const removed = await removeSet(s.training, t.work1);
    expect(removed?.id).toBe(t.work1);
    expect(s.one("session_set", t.work1)).toBeUndefined();
    expect(s.one("training_session", t.id)).toMatchObject({ rest_set_id: null });
    expect(await removeSet(s.training, t.work1)).toBeNull();
  });
});

describe("exercises of a Session", () => {
  it("adds exercises with the editor's defaults, in order", async () => {
    const s = await setupSessions();
    const t = await started(s);
    const ids = await addSessionExercises(s.training, t.id, [CURL, SQUAT]);
    const rows = s.exercises(t.id);
    expect(rows.map((row) => row["id"])).toEqual([t.squat, t.plank, ...ids]);
    expect(rows.slice(2).map((row) => row["exercise_title"])).toEqual(["Curl", "Squat"]);
    expect(rows[2]).toMatchObject({ rest_seconds: 120, source_workout_exercise_id: null });
    // Barbell compound: raised to 180 s.
    expect(rows[3]).toMatchObject({ rest_seconds: 180 });
    const sets = s.sets(ids[0] ?? "");
    expect(sets).toHaveLength(3);
    expect(JSON.parse(String(sets[0]?.["target"]))).toEqual({
      kind: "working",
      reps_min: 8,
      reps_max: 12,
    });
    expect(sets.every((row) => row["completed_at"] === null)).toBe(true);
    await expect(addSessionExercises(s.training, t.id, ["unknown"])).rejects.toThrow(
      "not in the library",
    );
    await expect(addSessionExercises(s.training, "missing", [CURL])).rejects.toThrow(
      "session is gone",
    );
  });

  it("holds at most 40 exercises, all or nothing", async () => {
    const s = await setupSessions();
    const id = await startSession(s.training, { workoutId: null, derivedTitle });
    await addSessionExercises(
      s.training,
      id,
      Array.from({ length: 38 }, () => CURL),
    );
    await expect(addSessionExercises(s.training, id, [CURL, CURL, CURL])).rejects.toBeInstanceOf(
      SessionLimitError,
    );
    expect(s.exercises(id)).toHaveLength(38);
    await addSessionExercises(s.training, id, [CURL, CURL]);
    expect(s.exercises(id)).toHaveLength(SESSION_LIMITS.exercisesPerSession);
  });

  it("replaces: the same type keeps the sets, another type gets that type's defaults", async () => {
    const s = await setupSessions();
    const t = await started(s);
    await tickSet(s.training, t.work1, { weight: 100, reps: 5 });
    expect(await replaceSessionExercise(s.training, t.squat, SQUAT)).toBe(false);
    expect(await replaceSessionExercise(s.training, t.squat, CURL)).toBe(true);
    expect(s.one("session_exercise", t.squat)).toMatchObject({
      exercise_id: CURL,
      exercise_title: "Curl",
      exercise_type: "weight_reps",
      source_workout_exercise_id: expect.any(String),
    });
    expect(s.sets(t.squat).map((row) => row["id"])).toEqual([t.warmup, t.work1, t.work2]);
    expect(s.one("session_set", t.work1)).toMatchObject({
      weight_kg: 100,
      completed_at: expect.any(String),
    });

    expect(await replaceSessionExercise(s.training, t.squat, PLANK)).toBe(true);
    expect(s.one("session_exercise", t.squat)).toMatchObject({
      exercise_type: "duration",
      exercise_title: "Plank",
      rest_seconds: 120,
    });
    const sets = s.sets(t.squat);
    expect(sets).toHaveLength(3);
    expect(sets.every((row) => row["completed_at"] === null && row["weight_kg"] === null)).toBe(
      true,
    );
    expect(JSON.parse(String(sets[0]?.["target"]))).toEqual({ kind: "working", duration_s: 30 });
  });

  it("moves with one row written and keeps supersets whole", async () => {
    const s = await setupSessions();
    const t = await started(s);
    const [curl, plank2] = await addSessionExercises(s.training, t.id, [CURL, PLANK]);
    expect(await moveSessionExercise(s.training, curl ?? "", t.squat)).toBe(true);
    expect(s.exercises(t.id).map((row) => row["id"])).toEqual([curl, t.squat, t.plank, plank2]);
    expect(await moveSessionExercise(s.training, curl ?? "", null)).toBe(true);
    expect(s.exercises(t.id).map((row) => row["id"])).toEqual([t.squat, t.plank, plank2, curl]);
    expect(await moveSessionExercise(s.training, curl ?? "", curl ?? "")).toBe(false);

    // A superset member dragged out of its run leaves the group.
    const group = "0192f0a0-0000-7000-8000-0000000000b1";
    s.sqlite
      .prepare("UPDATE session_exercise SET superset_group = ? WHERE id IN (?, ?)")
      .run(group, t.squat, t.plank);
    await moveSessionExercise(s.training, t.squat, null);
    expect(s.exercises(t.id).map((row) => row["superset_group"])).toEqual([null, null, null, null]);
  });

  it("removes an exercise with its sets and its Rest, repairing a superset of one", async () => {
    const s = await setupSessions();
    const t = await started(s);
    const group = "0192f0a0-0000-7000-8000-0000000000b2";
    s.sqlite
      .prepare("UPDATE session_exercise SET superset_group = ?, rest_seconds = NULL WHERE id = ?")
      .run(group, t.squat);
    s.sqlite
      .prepare("UPDATE session_exercise SET superset_group = ?, rest_seconds = 90 WHERE id = ?")
      .run(group, t.plank);
    await tickSet(s.training, t.work1, { weight: 100, reps: 5 });
    await startRest(s.training, t.id, t.work1, 90);
    const removed = await removeSessionExercise(s.training, t.squat);
    expect(removed?.exercise.id).toBe(t.squat);
    expect(removed?.sets).toHaveLength(3);
    expect(s.sets(t.squat)).toEqual([]);
    expect(s.one("training_session", t.id)).toMatchObject({ rest_set_id: null });
    expect(s.one("session_exercise", t.plank)).toMatchObject({
      superset_group: null,
      rest_seconds: 90,
    });
    expect(await removeSessionExercise(s.training, t.squat)).toBeNull();
  });
});

describe("Rest", () => {
  it("starts, adjusts and clears with absolute times tied to the set", async () => {
    const s = await setupSessions();
    const t = await started(s);
    const times = await startRest(s.training, t.id, t.work1, 120);
    expect(Date.parse(times.endsAt) - Date.parse(times.startedAt)).toBe(120_000);
    expect(s.one("training_session", t.id)).toMatchObject({
      rest_set_id: t.work1,
      rest_started_at: times.startedAt,
      rest_ends_at: times.endsAt,
    });
    // A new tick replaces the running Rest.
    const again = await startRest(s.training, t.id, t.work2, 60);
    expect(s.one("training_session", t.id)).toMatchObject({
      rest_set_id: t.work2,
      rest_ends_at: again.endsAt,
    });

    const longer = await adjustRest(s.training, t.id, 15);
    expect(Date.parse(longer?.endsAt ?? "") - Date.parse(again.endsAt)).toBe(15_000);
    expect(longer?.startedAt).toBe(again.startedAt);
    // Pulling the end to or past now clears it.
    expect(await adjustRest(s.training, t.id, -600)).toBeNull();
    expect(s.one("training_session", t.id)).toMatchObject({
      rest_set_id: null,
      rest_ends_at: null,
    });
    expect(await adjustRest(s.training, t.id, 15)).toBeNull();
    expect(await clearRest(s.training, t.id)).toBe(false);
    await startRest(s.training, t.id, t.work1, 30);
    expect(await clearRest(s.training, t.id)).toBe(true);
    expect(s.one("training_session", t.id)).toMatchObject({ rest_started_at: null });
  });

  it("refuses a length outside 1 to 600 seconds and a set of another Session", async () => {
    const s = await setupSessions();
    const t = await started(s);
    for (const seconds of [0, 601, 1.5, -5]) {
      await expect(startRest(s.training, t.id, t.work1, seconds)).rejects.toThrow("1 to 600");
    }
    await expect(startRest(s.training, t.id, "missing", 60)).rejects.toThrow("set is gone");
    await expect(startRest(s.training, "missing", t.work1, 60)).rejects.toThrow("session is gone");
  });
});

describe("finishSession", () => {
  it("drops unticked sets and exercises left empty, clears the Rest and finishes", async () => {
    const s = await setupSessions();
    const t = await started(s);
    await tickSet(s.training, t.warmup, { weight: 40, reps: 10 });
    await tickSet(s.training, t.work1, { weight: 100, reps: 5 });
    await startRest(s.training, t.id, t.work1, 120);
    const result = await finishSession(s.training, t.id, {
      finishedAt: new Date(Date.now() + 60_000).toISOString(),
    });
    expect(result).toEqual({ finished: true, droppedSets: 4, droppedExercises: 1 });
    expect(s.sets(t.squat).map((row) => row["id"])).toEqual([t.warmup, t.work1]);
    expect(s.exercises(t.id).map((row) => row["id"])).toEqual([t.squat]);
    expect(s.one("training_session", t.id)).toMatchObject({
      finished_at: expect.any(String),
      rest_set_id: null,
      rest_started_at: null,
      rest_ends_at: null,
      title: "Legs",
      title_derived: 0,
    });
  });

  it("is idempotent", async () => {
    const s = await setupSessions();
    const t = await started(s);
    await tickSet(s.training, t.work1, { weight: 100, reps: 5 });
    await finishSession(s.training, t.id);
    const finishedAt = s.one("training_session", t.id)?.["finished_at"];
    expect(await finishSession(s.training, t.id, { title: "Other" })).toEqual({
      finished: false,
      droppedSets: 0,
      droppedExercises: 0,
    });
    expect(s.one("training_session", t.id)).toMatchObject({
      finished_at: finishedAt,
      title: "Legs",
    });
  });

  it("writes the summary's edits and stops deriving a renamed title", async () => {
    const s = await setupSessions();
    const plan = await pushWorkout(s, null);
    const id = await startSession(s.training, { workoutId: plan.workoutId, derivedTitle });
    const started = new Date(Date.now() - 2 * 3600_000).toISOString();
    await finishSession(s.training, id, {
      title: "Leg day",
      note: "Felt strong",
      startedAt: started,
      durationSeconds: 3000,
    });
    expect(s.one("training_session", id)).toMatchObject({
      title: "Leg day",
      title_derived: 0,
      note: "Felt strong",
      started_at: started,
      duration_s: 3000,
    });
    const second = await startSession(s.training, { workoutId: null, derivedTitle: "Workout" });
    await finishSession(s.training, second, { title: "Workout" });
    expect(s.one("training_session", second)).toMatchObject({ title_derived: 1 });
  });

  it("refuses bad edits and leaves the Session unfinished", async () => {
    const s = await setupSessions();
    const t = await started(s);
    await tickSet(s.training, t.work1, { weight: 100, reps: 5 });
    await expect(finishSession(s.training, t.id, { title: "" })).rejects.toThrow();
    await expect(finishSession(s.training, t.id, { durationSeconds: 90_000 })).rejects.toThrow();
    await expect(
      finishSession(s.training, t.id, { startedAt: "2000-01-01T00:00:00Z" }),
    ).rejects.toThrow("10 years");
    await expect(
      finishSession(s.training, t.id, { finishedAt: "2020-01-01T00:00:00Z" }),
    ).rejects.toThrow("cannot end before");
    expect(s.one("training_session", t.id)).toMatchObject({ finished_at: null });
    expect(s.sets(t.squat)).toHaveLength(3);
    await expect(finishSession(s.training, "missing")).rejects.toThrow("session is gone");
  });
});

describe("discard, restore and take over", () => {
  it("discards the whole Session and restores it with the same ids and the restore marker", async () => {
    const s = await setupSessions();
    const t = await started(s);
    await tickSet(s.training, t.work1, { weight: 100, reps: 5 });
    const before = {
      session: s.all("training_session"),
      exercises: s.all("session_exercise"),
      sets: s.all("session_set"),
    };
    const deleted = await discardSession(s.training, t.id);
    expect(deleted?.exercises).toHaveLength(2);
    expect(deleted?.sets).toHaveLength(6);
    for (const table of ["training_session", "session_exercise", "session_set"]) {
      expect(s.all(table), table).toEqual([]);
    }
    expect(await discardSession(s.training, t.id)).toBeNull();

    expect(deleted && (await restoreSession(s.training, deleted))).toBe(true);
    const marked = <Row extends object>(rows: Row[]) => rows.map((row) => ({ ...row, restore: 1 }));
    expect(s.all("training_session")).toEqual(marked(before.session));
    expect(s.all("session_exercise")).toEqual(marked(before.exercises));
    expect(s.all("session_set")).toEqual(marked(before.sets));
    expect(deleted && (await restoreSession(s.training, deleted))).toBe(false);
  });

  it("takes over for this device, once", async () => {
    const s = await setupSessions();
    const t = await started(s);
    s.sqlite
      .prepare("UPDATE training_session SET device_id = ? WHERE id = ?")
      .run("another-device", t.id);
    expect(await takeOver(s.training, t.id)).toBe(true);
    expect(s.one("training_session", t.id)).toMatchObject({ device_id: s.installId });
    expect(await takeOver(s.training, t.id)).toBe(false);
    expect(await takeOver(s.training, "missing")).toBe(false);
  });
});

describe("logPastSession", () => {
  it("creates a finished Session at the chosen date with no timers", async () => {
    const s = await setupSessions();
    const plan = await pushWorkout(s);
    const when = new Date(Date.now() - 3 * 86_400_000).toISOString();
    const id = await logPastSession(
      s.training,
      { workoutId: plan.workoutId, derivedTitle },
      { startedAt: when, durationSeconds: 3600 },
    );
    expect(s.one("training_session", id)).toMatchObject({
      started_at: when,
      finished_at: new Date(Date.parse(when) + 3_600_000).toISOString(),
      duration_s: 3600,
      rest_set_id: null,
      title: "Legs",
    });
    expect(s.exercises(id)).toHaveLength(2);
    const empty = await logPastSession(
      s.training,
      { workoutId: null, derivedTitle: "Workout" },
      { startedAt: when },
    );
    expect(s.one("training_session", empty)).toMatchObject({
      started_at: when,
      finished_at: when,
      duration_s: null,
    });
  });

  it("refuses a date in the future or more than 10 years back", async () => {
    const s = await setupSessions();
    const source = { workoutId: null, derivedTitle };
    await expect(
      logPastSession(s.training, source, {
        startedAt: new Date(Date.now() + 86_400_000).toISOString(),
      }),
    ).rejects.toThrow("10 years");
    await expect(
      logPastSession(s.training, source, { startedAt: "2001-01-01T00:00:00Z" }),
    ).rejects.toThrow("10 years");
    expect(s.all("training_session")).toEqual([]);
  });
});

describe("equipment and settings", () => {
  const bar = {
    kind: "bar",
    weight_kg: 20,
    unit: "kg",
    label: null,
    count: null,
    enabled: true,
  } as const;

  it("adds items and updates only what changed", async () => {
    const s = await setupSessions();
    const [id, plate] = await upsertEquipment(s.training, [
      bar,
      { ...bar, kind: "plate", weight_kg: 2.5, count: 4 },
    ]);
    expect(s.one("gym_equipment", id ?? "")).toMatchObject({
      user_id: "owner",
      kind: "bar",
      enabled: 1,
      label: null,
    });
    expect(s.one("gym_equipment", plate ?? "")).toMatchObject({ count: 4 });
    expect(await upsertEquipment(s.training, [{ ...bar, id, enabled: false }])).toEqual([id]);
    expect(s.one("gym_equipment", id ?? "")).toMatchObject({ enabled: 0, weight_kg: 20 });
    expect(s.all("gym_equipment")).toHaveLength(2);
    await expect(
      upsertEquipment(s.training, [{ ...bar, kind: "rack" as never }]),
    ).rejects.toThrow();
    await expect(upsertEquipment(s.training, [{ ...bar, weight_kg: 1001 }])).rejects.toThrow();
    expect(s.all("gym_equipment")).toHaveLength(2);
  });

  it("keeps one setting per exercise", async () => {
    const s = await setupSessions();
    const [barId] = await upsertEquipment(s.training, [bar]);
    const id = await setExerciseSetting(s.training, SQUAT, { bar_id: barId });
    expect(s.one("exercise_setting", id)).toMatchObject({
      exercise_id: SQUAT,
      bar_id: barId,
      log_effort: 0,
      user_id: "owner",
    });
    expect(await setExerciseSetting(s.training, SQUAT, { log_effort: true })).toBe(id);
    expect(s.one("exercise_setting", id)).toMatchObject({ bar_id: barId, log_effort: 1 });
    expect(s.all("exercise_setting")).toHaveLength(1);
    expect(await setExerciseSetting(s.training, CURL, {})).not.toBe(id);
    expect(s.all("exercise_setting")).toHaveLength(2);
    await expect(setExerciseSetting(s.training, SQUAT, { bar_id: "nope" })).rejects.toThrow();
  });
});
