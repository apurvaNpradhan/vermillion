import { describe, expect, it } from "vitest";

import { SQUAT, pushWorkout, setupSessions } from "./session-fixtures";
import { setExerciseSetting } from "./equipment-store";
import {
  supersetSessionWithNext,
  tickSet,
  updateSessionExercise,
  updateSet,
} from "./session-content-store";
import type { SessionSetRow } from "./session-common";
import { RECENT_QUERY } from "../../exercise/library";
import { performAgain, plannedFromLogged } from "./session-again-store";
import { beginSession } from "./session-store";
import { finishSession, startSession } from "./session-store";
import { parseSessionDetail, SESSION_DETAIL_SQL } from "./session-watch";

const derivedTitle = "Quadriceps";

async function finishedLegs() {
  const s = await setupSessions();
  const plan = await pushWorkout(s);
  const id = await startSession(s.training, { workoutId: plan.workoutId, derivedTitle });
  const [squat, plank] = s.exercises(id).map((row) => String(row["id"]));
  const [warmup, work1, work2] = s.sets(squat ?? "").map((row) => String(row["id"]));
  await tickSet(s.training, warmup ?? "", { weight: 42.5, reps: 9 });
  await updateSet(s.training, work1 ?? "", { rpe: 8.5 });
  await updateSet(s.training, work2 ?? "", { rpe: 8 });
  await tickSet(s.training, work1 ?? "", { weight: 102.5, reps: 6 });
  await tickSet(s.training, work2 ?? "", { weight: 100, reps: 5 });
  const [plankSet] = s.sets(plank ?? "").map((row) => String(row["id"]));
  await tickSet(s.training, plankSet ?? "", { duration: 45 });
  await updateSessionExercise(s.training, squat ?? "", { note: "Belt on", rest_seconds: 150 });
  await supersetSessionWithNext(s.training, squat ?? "");
  await finishSession(s.training, id, { finishedAt: new Date(Date.now() + 60_000).toISOString() });
  return { s, id, squat: squat ?? "" };
}

describe("performAgain", () => {
  it("copies exercises, order, supersets, kinds and rest with the past values as targets", async () => {
    const { s, id } = await finishedLegs();
    const copy = await performAgain(s.training, id, derivedTitle);
    expect(copy).not.toBe(id);
    expect(s.one("training_session", copy)).toMatchObject({
      title: "Legs",
      finished_at: null,
      workout_id: null,
      run_id: null,
      note: null,
      device_id: s.installId,
    });
    const original = s.exercises(id);
    const rows = s.exercises(copy);
    expect(rows.map((row) => row["exercise_id"])).toEqual(original.map((r) => r["exercise_id"]));
    expect(rows.map((row) => row["position"])).toEqual(original.map((r) => r["position"]));
    // In a superset only the last member holds the rest, as in the original.
    expect(rows.map((row) => row["rest_seconds"])).toEqual(original.map((r) => r["rest_seconds"]));
    expect(rows[1]).toMatchObject({
      rest_seconds: 120,
      note: null,
      source_workout_exercise_id: null,
    });
    expect(rows[0]?.["superset_group"]).toBeTruthy();
    expect(rows[0]?.["superset_group"]).toBe(rows[1]?.["superset_group"]);
    expect(rows[0]?.["superset_group"]).not.toBe(original[0]?.["superset_group"]);

    const sets = s.sets(String(rows[0]?.["id"]));
    expect(sets.map((row) => row["kind"])).toEqual(["warmup", "working", "working"]);
    expect(sets.every((row) => row["completed_at"] === null)).toBe(true);
    expect(sets.map((row) => JSON.parse(String(row["target"])))).toEqual([
      { kind: "warmup", weight_kg: 42.5, reps_min: 9, reps_max: 9 },
      {
        kind: "working",
        weight_kg: 102.5,
        reps_min: 6,
        reps_max: 6,
        effort_min: 8.5,
        effort_max: 8.5,
      },
      { kind: "working", weight_kg: 100, reps_min: 5, reps_max: 5, effort_min: 8, effort_max: 8 },
    ]);
    const plankSets = s.sets(String(rows[1]?.["id"]));
    expect(JSON.parse(String(plankSets[0]?.["target"]))).toEqual({
      kind: "working",
      duration_s: 45,
    });
    // The original is untouched.
    expect(s.exercises(id)).toEqual(original);
  });

  it("is idempotent on the id and refuses an unfinished session", async () => {
    const { s, id } = await finishedLegs();
    const fresh = "0192f0a0-0000-7000-8000-0000000000aa";
    expect(await performAgain(s.training, id, derivedTitle, { id: fresh })).toBe(fresh);
    expect(await performAgain(s.training, id, derivedTitle, { id: fresh })).toBe(fresh);
    expect(s.exercises(fresh)).toHaveLength(2);
    const live = await startSession(s.training, { workoutId: null, derivedTitle });
    await expect(performAgain(s.training, live, derivedTitle)).rejects.toThrow(/finished/);
  });

  it("shows the earlier note as Last time and the pinned note in the detail", async () => {
    const { s, id } = await finishedLegs();
    await setExerciseSetting(s.training, SQUAT, { note: "Heels down" });
    const copy = await performAgain(s.training, id, derivedTitle);
    const detail = parseSessionDetail(s.sqlite.prepare(SESSION_DETAIL_SQL).all(copy));
    expect(detail?.exercises[0]).toMatchObject({ pinnedNote: "Heels down", lastNote: "Belt on" });
    expect(detail?.exercises[1]).toMatchObject({ pinnedNote: null, lastNote: null });
  });
});

const blank: SessionSetRow = {
  id: "a",
  user_id: "owner",
  session_exercise_id: "b",
  position: "a0",
  kind: "working",
  weight_kg: null,
  reps: null,
  duration_s: null,
  distance_m: null,
  floors: null,
  steps: null,
  rpe: null,
  completed_at: null,
  timer_started_at: null,
  target: null,
  generated_warmup: false,
  created_at: "now",
  restore: null,
};

describe("plannedFromLogged", () => {
  it("drops empty and out-of-range values", () => {
    expect(
      plannedFromLogged({
        ...blank,
        reps: 0,
        rpe: 5.2,
      }),
    ).toEqual({ kind: "working" });
  });
});

describe("recent exercises and the workout note", () => {
  it("lists exercises of finished sessions only, newest first, once each", async () => {
    const { s } = await finishedLegs();
    // An unfinished session does not count as training.
    await startSession(s.training, { workoutId: null, derivedTitle });
    const run = () => s.sqlite.prepare(RECENT_QUERY.sql).all(...RECENT_QUERY.params);
    expect(
      run()
        .map((row) => (row as { title: string }).title)
        .sort(),
    ).toEqual(["Plank", "Squat"]);
    expect(new Set(run().map((row) => (row as { id: string }).id)).size).toBe(2);
  });

  it("carries the workout note into the session detail", async () => {
    const s = await setupSessions();
    const plan = await pushWorkout(s);
    s.sqlite.prepare("UPDATE workout SET note = ? WHERE id = ?").run("Go heavy", plan.workoutId);
    const id = await startSession(s.training, { workoutId: plan.workoutId, derivedTitle });
    const detail = parseSessionDetail(s.sqlite.prepare(SESSION_DETAIL_SQL).all(id));
    expect(detail?.workoutNote).toBe("Go heavy");
    s.sqlite.prepare("UPDATE workout SET note = '  ' WHERE id = ?").run(plan.workoutId);
    expect(
      parseSessionDetail(s.sqlite.prepare(SESSION_DETAIL_SQL).all(id))?.workoutNote,
    ).toBeNull();
  });
});

describe("beginSession", () => {
  it("keeps the active session when the repeated source is missing", async () => {
    const s = await setupSessions();
    const live = await startSession(s.training, { workoutId: null, derivedTitle });
    await expect(
      beginSession(s.training, { againOf: "missing-source" }, derivedTitle, {
        discardIds: [live],
      }),
    ).rejects.toThrow();
    expect(s.one("training_session", live)).toMatchObject({ id: live, finished_at: null });
  });

  it("keeps the active session when the repeated source is unfinished", async () => {
    const s = await setupSessions();
    const live = await startSession(s.training, { workoutId: null, derivedTitle });
    const other = await startSession(s.training, { workoutId: null, derivedTitle });
    await expect(
      beginSession(s.training, { againOf: other }, derivedTitle, { discardIds: [live] }),
    ).rejects.toThrow(/finished/);
    expect(s.one("training_session", live)).toBeDefined();
  });

  it("discards the active session and creates the repeat together", async () => {
    const { s, id } = await finishedLegs();
    const live = await startSession(s.training, { workoutId: null, derivedTitle });
    const result = await beginSession(s.training, { againOf: id }, derivedTitle, {
      discardIds: [live],
    });
    expect(result.outcome).toBe("started");
    expect(result.removed.map((deleted) => deleted.session.id)).toEqual([live]);
    expect(s.one("training_session", live)).toBeUndefined();
    expect(s.exercises(result.id)).toHaveLength(2);
  });

  it("resumes a session that appeared before the start instead of starting a second one", async () => {
    const s = await setupSessions();
    const plan = await pushWorkout(s);
    const live = await startSession(s.training, { workoutId: null, derivedTitle });
    const result = await beginSession(s.training, { workoutId: plan.workoutId }, derivedTitle, {
      resumeActive: true,
    });
    expect(result).toMatchObject({ id: live, outcome: "resumed", removed: [] });
    const fresh = await beginSession(s.training, { workoutId: plan.workoutId }, derivedTitle, {
      resumeActive: true,
      discardIds: [live],
    });
    expect(fresh.outcome).toBe("started");
  });

  it("starts the workout when nothing is active", async () => {
    const s = await setupSessions();
    const plan = await pushWorkout(s);
    const result = await beginSession(s.training, { workoutId: plan.workoutId }, derivedTitle, {
      resumeActive: true,
    });
    expect(result.outcome).toBe("started");
    expect(s.exercises(result.id).length).toBeGreaterThan(0);
  });
});

describe("repeated exercises", () => {
  it("marks every copied exercise as repeated", async () => {
    const { s, id } = await finishedLegs();
    const copy = await performAgain(s.training, id, derivedTitle);
    expect(s.exercises(copy).every((row) => row["repeated"] === 1)).toBe(true);
    expect(s.exercises(id).every((row) => !row["repeated"])).toBe(true);
    const detail = parseSessionDetail(s.sqlite.prepare(SESSION_DETAIL_SQL).all(copy));
    expect(detail?.exercises.every((exercise) => exercise.repeated)).toBe(true);
  });
});
