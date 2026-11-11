import { describe, expect, it } from "vitest";
import { pushWorkout, setupSessions } from "./session-fixtures";
import { updateWorkoutExercise } from "./exercise-store";
import { startSession, finishSession, logPastSession } from "./session-store";
import { tickSet, updateSet } from "./session-content-store";
import { applySessionWorkout, editFinishedSession } from "./session-workout-store";

async function fixture() {
  const s = await setupSessions();
  const plan = await pushWorkout(s, "Legs");
  const id = await startSession(s.training, { workoutId: plan.workoutId, derivedTitle: "Legs" });
  const entry = String(s.exercises(id)[0]?.["id"]);
  const setId = String(s.sets(entry)[1]?.["id"]);
  await tickSet(s.training, setId, { weight: 120, reps: 6 });
  await finishSession(s.training, id);
  return { s, plan, id, setId };
}
describe("applying Session changes", () => {
  it("preserves later workout rest and pinned note edits when applying structure", async () => {
    const { s, plan, id } = await fixture();
    s.sqlite
      .prepare("UPDATE workout_exercise SET rest_seconds = 45, note = 'New note' WHERE id = ?")
      .run(plan.squat);
    await applySessionWorkout(s.training, id, { structure: true, targets: false, saveNew: false });
    expect(s.one("workout_exercise", plan.squat)).toMatchObject({
      rest_seconds: 45,
      note: "New note",
    });
  });
  it("leaves both options off and changes only weights when targets are on", async () => {
    const { s, plan, id } = await fixture();
    const before = s.one("workout_exercise", plan.squat);
    await applySessionWorkout(s.training, id, { structure: false, targets: false, saveNew: false });
    expect(s.one("workout_exercise", plan.squat)).toEqual(before);
    await applySessionWorkout(s.training, id, { structure: false, targets: true, saveNew: false });
    const sets = JSON.parse(String(s.one("workout_exercise", plan.squat)?.["sets"]));
    expect(sets[1]).toMatchObject({
      weight_kg: 120,
      reps_min: 5,
      reps_max: 8,
      effort_min: 8,
      effort_max: 8,
    });
    expect(s.one("workout_exercise", plan.plank)).toBeDefined();
  });
  it("updates top and back-off targets from their own logged weights", async () => {
    const s = await setupSessions();
    const plan = await pushWorkout(s, "Legs");
    await updateWorkoutExercise(s.training, plan.squat, {
      sets: [
        { kind: "top", reps_min: 3, reps_max: 3, weight_kg: 140 },
        { kind: "backoff", reps_min: 6, reps_max: 6, weight_kg: 110 },
      ],
    });
    const id = await startSession(s.training, { workoutId: plan.workoutId, derivedTitle: "Legs" });
    const entry = String(s.exercises(id)[0]?.["id"]);
    const [top, backoff] = s.sets(entry);
    await tickSet(s.training, String(top?.["id"]), { weight: 145, reps: 3 });
    await tickSet(s.training, String(backoff?.["id"]), { weight: 115, reps: 6 });
    await finishSession(s.training, id);
    await applySessionWorkout(s.training, id, { structure: false, targets: true, saveNew: false });
    const sets = JSON.parse(String(s.one("workout_exercise", plan.squat)?.["sets"]));
    expect(sets).toMatchObject([
      { kind: "top", weight_kg: 145 },
      { kind: "backoff", weight_kg: 115 },
    ]);
  });
  it("changes structure alone while preserving planned weight", async () => {
    const { s, plan, id } = await fixture();
    await applySessionWorkout(s.training, id, { structure: true, targets: false, saveNew: false });
    expect(JSON.parse(String(s.one("workout_exercise", plan.squat)?.["sets"]))).toEqual([
      { kind: "working", reps_min: 5, reps_max: 8, weight_kg: 100, effort_min: 8, effort_max: 8 },
    ]);
    expect(s.one("workout_exercise", plan.plank)).toBeUndefined();
  });
  it("applies both changes together and refuses a stale account scope", async () => {
    const { s, plan, id } = await fixture();
    const before = s.one("workout_exercise", plan.squat);
    await expect(
      applySessionWorkout(
        s.training,
        id,
        { structure: true, targets: true, saveNew: false },
        "other-account",
      ),
    ).rejects.toThrow();
    expect(s.one("workout_exercise", plan.squat)).toEqual(before);
    await applySessionWorkout(s.training, id, { structure: true, targets: true, saveNew: false });
    expect(JSON.parse(String(s.one("workout_exercise", plan.squat)?.["sets"]))).toEqual([
      { kind: "working", reps_min: 5, reps_max: 8, weight_kg: 120, effort_min: 8, effort_max: 8 },
    ]);
    expect(s.one("workout_exercise", plan.plank)).toBeUndefined();
  });
  it("saves a separate Workout even when the source still exists", async () => {
    const { s, plan, id } = await fixture();
    const before = s.one("workout_exercise", plan.squat);
    const saved = await applySessionWorkout(s.training, id, {
      structure: true,
      targets: true,
      saveNew: true,
    });
    expect(saved).not.toBe(plan.workoutId);
    expect(s.one("workout_exercise", plan.squat)).toEqual(before);
  });
  it("edits metadata and derives the end, refusing invalid dates", async () => {
    const { s, id } = await fixture();
    const start = new Date(Date.now() - 86400000).toISOString();
    await editFinishedSession(s.training, id, {
      title: "Yesterday",
      startedAt: start,
      durationSeconds: 1800,
    });
    expect(s.one("training_session", id)).toMatchObject({
      title: "Yesterday",
      duration_s: 1800,
      finished_at: new Date(Date.parse(start) + 1800000).toISOString(),
    });
    await expect(
      editFinishedSession(s.training, id, { startedAt: "2099-01-01T00:00:00.000Z" }),
    ).rejects.toThrow();
  });
  it("implies a tick only once a backfilled set has required actuals", async () => {
    const { s, plan } = await fixture();
    const id = await logPastSession(
      s.training,
      { workoutId: plan.workoutId, derivedTitle: "Legs" },
      { startedAt: new Date(Date.now() - 86400000).toISOString() },
    );
    const set = String(s.sets(String(s.exercises(id)[0]?.["id"]))[1]?.["id"]);
    await updateSet(s.training, set, { weight_kg: 100 });
    expect(s.one("session_set", set)?.["completed_at"]).toBeNull();
    await updateSet(s.training, set, { reps: 8 });
    expect(s.one("session_set", set)?.["completed_at"]).not.toBeNull();
  });
});
