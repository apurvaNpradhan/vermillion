import { describe, expect, it } from "vitest";

import { WORKOUT_DETAIL_SQL, parseWorkoutDetail } from "../watch";
import { setExerciseSetting } from "./equipment-store";
import { pushWorkout, setupSessions, SQUAT, CURL } from "./session-fixtures";
import { startSession } from "./session-store";
import { SESSION_DETAIL_SQL, parseSessionDetail } from "./session-watch";

describe("an exercise's progression rule", () => {
  it("is stored with the setting, apart from its other switches, and cleared back to Double", async () => {
    const s = await setupSessions();
    const id = await setExerciseSetting(s.training, SQUAT, { auto_warmups: true });
    expect(s.one("exercise_setting", id)).toMatchObject({ progression_rule: null });
    await setExerciseSetting(s.training, SQUAT, { progression_rule: { id: "linear" } });
    expect(JSON.parse(String(s.one("exercise_setting", id)?.["progression_rule"]))).toEqual({
      id: "linear",
    });
    expect(s.one("exercise_setting", id)).toMatchObject({ auto_warmups: 1 });
    await setExerciseSetting(s.training, SQUAT, {
      progression_rule: { id: "top_backoff", backoff_percent: 85 },
    });
    expect(s.all("exercise_setting")).toHaveLength(1);
    await setExerciseSetting(s.training, SQUAT, { progression_rule: null });
    expect(s.one("exercise_setting", id)).toMatchObject({
      progression_rule: null,
      auto_warmups: 1,
    });
  });

  it("refuses a rule it does not know and a share outside its range", async () => {
    const s = await setupSessions();
    await expect(
      // @ts-expect-error: a rule id the schema does not have.
      setExerciseSetting(s.training, SQUAT, { progression_rule: { id: "wave" } }),
    ).rejects.toThrow();
    await expect(
      setExerciseSetting(s.training, SQUAT, {
        progression_rule: { id: "top_backoff", backoff_percent: 20 },
      }),
    ).rejects.toThrow();
    expect(s.all("exercise_setting")).toHaveLength(0);
  });

  it("reaches the Workout entry and the Session entry", async () => {
    const s = await setupSessions();
    const { workoutId, squat } = await pushWorkout(s);
    await setExerciseSetting(s.training, SQUAT, { progression_rule: { id: "maintain" } });
    const plan = parseWorkoutDetail(await s.training.getAll(WORKOUT_DETAIL_SQL, [workoutId]));
    expect(plan?.exercises.find(({ id }) => id === squat)?.exercise?.rule).toEqual({
      id: "maintain",
    });
    expect(plan?.exercises.find(({ exerciseId }) => exerciseId === CURL)).toBeUndefined();
    const sessionId = await startSession(s.training, { workoutId, derivedTitle: "Legs" });
    const session = parseSessionDetail(await s.training.getAll(SESSION_DETAIL_SQL, [sessionId]));
    expect(session?.exercises[0]?.rule).toEqual({ id: "maintain" });
  });

  it("reads a rule a newer build wrote as Double instead of failing the Session", async () => {
    const s = await setupSessions();
    const { workoutId } = await pushWorkout(s);
    const id = await setExerciseSetting(s.training, SQUAT, {});
    s.sqlite
      .prepare("UPDATE exercise_setting SET progression_rule = ? WHERE id = ?")
      .run('{"id":"percent_of_max","percent":85}', id);
    const sessionId = await startSession(s.training, { workoutId, derivedTitle: "Legs" });
    const session = parseSessionDetail(await s.training.getAll(SESSION_DETAIL_SQL, [sessionId]));
    expect(session?.exercises[0]?.rule).toBeNull();
    const plan = parseWorkoutDetail(await s.training.getAll(WORKOUT_DETAIL_SQL, [workoutId]));
    expect(plan?.exercises[0]?.exercise?.rule).toBeNull();
  });
});
