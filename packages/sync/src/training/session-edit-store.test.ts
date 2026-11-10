import { describe, expect, it } from "vitest";

import { CURL, pushWorkout, setupSessions, type Sessions } from "./session-fixtures";
import {
  addSessionExercises,
  leaveSessionSuperset,
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
