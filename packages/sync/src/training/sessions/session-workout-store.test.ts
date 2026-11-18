import { diffSessionAgainstWorkout } from "@workspace/shared";
import { describe, expect, it } from "vitest";
import { pushWorkout, setupSessions } from "./session-fixtures";
import { updateWorkoutExercise } from "../plans/exercise-store";
import { startSession, finishSession, logPastSession } from "./session-store";
import { removeSet, tickSet, updateSet } from "./session-content-store";
import { readWorkoutDetail } from "../watch";
import { parseSessionDetail, SESSION_DETAIL_SQL } from "./session-watch";
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
  it("preserves skipped sets and other exercises when applying structure to an already saved session", async () => {
    const { s, plan, id } = await fixture();
    const before = s.one("workout_exercise", plan.squat)?.["sets"];
    await applySessionWorkout(s.training, id, { structure: true, targets: false, saveNew: false });
    expect(s.one("workout_exercise", plan.squat)?.["sets"]).toEqual(before);
    expect(s.one("workout_exercise", plan.plank)).toBeDefined();
  });
  it("applies explicit removals and preserves skipped rows from the pre-save grid", async () => {
    const s = await setupSessions();
    const plan = await pushWorkout(s);
    const id = await startSession(s.training, { workoutId: plan.workoutId, derivedTitle: "Legs" });
    const [warmup, work1, work2] = s.sets(String(s.exercises(id)[0]?.["id"]));
    await removeSet(s.training, String(warmup?.["id"]));
    await tickSet(s.training, String(work2?.["id"]), { weight: 120, reps: 5 });
    const session = parseSessionDetail(s.sqlite.prepare(SESSION_DETAIL_SQL).all(id));
    if (!session) throw new Error("Missing session");
    await finishSession(s.training, id);
    expect(s.one("session_set", String(work1?.["id"]))).toBeUndefined();
    await applySessionWorkout(s.training, id, {
      structure: true,
      targets: true,
      saveNew: false,
      draft: { session, completeStructure: true },
    });
    expect((await readWorkoutDetail(s.training, plan.workoutId))?.exercises[0]?.sets).toMatchObject(
      [
        { kind: "working", weight_kg: 100 },
        { kind: "working", weight_kg: 120 },
      ],
    );
    expect(s.one("workout_exercise", plan.plank)).toBeDefined();
  });
  it("keeps the remaining set's prescription after removing a set of the same kind", async () => {
    const s = await setupSessions();
    const plan = await pushWorkout(s);
    await updateWorkoutExercise(s.training, plan.squat, {
      sets: [
        { kind: "working", reps_min: 3, reps_max: 3, weight_kg: 120 },
        { kind: "working", reps_min: 8, reps_max: 8, weight_kg: 100 },
      ],
    });
    const id = await startSession(s.training, { workoutId: plan.workoutId, derivedTitle: "Legs" });
    const [removed, kept] = s.sets(String(s.exercises(id)[0]?.["id"]));
    await removeSet(s.training, String(removed?.["id"]));
    await tickSet(s.training, String(kept?.["id"]), { weight: 110, reps: 8 });
    const session = parseSessionDetail(s.sqlite.prepare(SESSION_DETAIL_SQL).all(id));
    if (!session) throw new Error("Missing session");
    await finishSession(s.training, id);
    await applySessionWorkout(s.training, id, {
      structure: true,
      targets: false,
      saveNew: false,
      draft: { session, completeStructure: true },
    });
    expect((await readWorkoutDetail(s.training, plan.workoutId))?.exercises[0]?.sets).toEqual([
      { kind: "working", reps_min: 8, reps_max: 8, weight_kg: 100 },
    ]);
  });

  async function twoSetPlan() {
    const s = await setupSessions();
    const plan = await pushWorkout(s);
    await updateWorkoutExercise(s.training, plan.squat, {
      sets: [
        { kind: "working", reps_min: 3, reps_max: 3, weight_kg: 120 },
        { kind: "working", reps_min: 8, reps_max: 8, weight_kg: 100 },
      ],
    });
    const id = await startSession(s.training, { workoutId: plan.workoutId, derivedTitle: "Legs" });
    const [first, second] = s.sets(String(s.exercises(id)[0]?.["id"]));
    return { s, plan, id, first, second };
  }
  const planWeights = async (s: Awaited<ReturnType<typeof setupSessions>>, id: string) =>
    (await readWorkoutDetail(s.training, id))?.exercises[0]?.sets.map((set) => set.weight_kg);

  it("targets-only update writes to the planned set that was logged, not the first", async () => {
    const { s, plan, id, second } = await twoSetPlan();
    await tickSet(s.training, String(second?.["id"]), { weight: 110, reps: 8 });
    await finishSession(s.training, id);
    await applySessionWorkout(s.training, id, { structure: false, targets: true, saveNew: false });
    expect(await planWeights(s, plan.workoutId)).toEqual([120, 110]);
  });

  it("previews the same change after an explicit removal that it saves", async () => {
    const { s, plan, id, first, second } = await twoSetPlan();
    await removeSet(s.training, String(first?.["id"]));
    await tickSet(s.training, String(second?.["id"]), { weight: 120, reps: 8 });
    const session = parseSessionDetail(s.sqlite.prepare(SESSION_DETAIL_SQL).all(id));
    if (!session) throw new Error("Missing session");
    const detail = await readWorkoutDetail(s.training, plan.workoutId);
    const exercises = (detail?.exercises ?? []).map((entry) => ({
      id: entry.id,
      exerciseId: entry.exerciseId,
      sets: entry.sets,
    }));
    expect(diffSessionAgainstWorkout(session, { exercises }, true).targets[0]).toMatchObject({
      before: [120, 100],
      after: [120, 120],
    });
    await finishSession(s.training, id);
    await applySessionWorkout(s.training, id, {
      structure: true,
      targets: true,
      saveNew: false,
      draft: { session, completeStructure: true },
    });
    expect(await planWeights(s, plan.workoutId)).toEqual([120]);
  });

  it("applies structure and targets together after a skipped first set", async () => {
    const { s, plan, id, second } = await twoSetPlan();
    await tickSet(s.training, String(second?.["id"]), { weight: 110, reps: 8 });
    await finishSession(s.training, id);
    await applySessionWorkout(s.training, id, { structure: true, targets: true, saveNew: false });
    expect(await planWeights(s, plan.workoutId)).toEqual([120, 110]);
  });

  it("leaves targets alone on a legacy session when the matching is ambiguous", async () => {
    const { s, plan, id, second } = await twoSetPlan();
    await tickSet(s.training, String(second?.["id"]), { weight: 110, reps: 8 });
    await finishSession(s.training, id);
    s.sqlite.prepare("UPDATE training_session SET workout_structure = NULL WHERE id = ?").run(id);
    await applySessionWorkout(s.training, id, { structure: false, targets: true, saveNew: false });
    expect(await planWeights(s, plan.workoutId)).toEqual([120, 100]);
  });

  it("preserves sets added to the workout after the session started", async () => {
    const s = await setupSessions();
    const plan = await pushWorkout(s);
    const id = await startSession(s.training, { workoutId: plan.workoutId, derivedTitle: "Legs" });
    const before = await readWorkoutDetail(s.training, plan.workoutId);
    const sets = before?.exercises[0]?.sets ?? [];
    await updateWorkoutExercise(s.training, plan.squat, { sets: [...sets, { kind: "drop" }] });
    const [first] = s.exercises(id);
    await tickSet(s.training, String(s.sets(String(first?.["id"]))[1]?.["id"]), {
      weight: 120,
      reps: 5,
    });
    const session = parseSessionDetail(s.sqlite.prepare(SESSION_DETAIL_SQL).all(id));
    if (!session) throw new Error("Missing session");
    await finishSession(s.training, id);
    await applySessionWorkout(s.training, id, {
      structure: true,
      targets: false,
      saveNew: false,
      draft: { session, completeStructure: true },
    });
    expect(
      (await readWorkoutDetail(s.training, plan.workoutId))?.exercises[0]?.sets.at(-1)?.kind,
    ).toBe("drop");
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
    expect(JSON.parse(String(s.one("workout_exercise", plan.squat)?.["sets"]))).toMatchObject([
      { kind: "warmup", weight_kg: 40 },
      { kind: "working", weight_kg: 120 },
      { kind: "working", weight_kg: 100 },
    ]);
    expect(s.one("workout_exercise", plan.plank)).toBeDefined();
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
