import { diffSessionAgainstWorkout } from "@workspace/shared";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { CURL, PLANK, SQUAT, pushWorkout, setupSessions, type Sessions } from "./session-fixtures";
import { addSessionExercises, tickSet, updateSet } from "./session-content-store";
import { replaceSessionExercise, swapTargets } from "./session-swap-store";
import { finishSession, startSession } from "./session-store";
import { applySessionWorkout } from "./session-workout-store";
import { parseSessionDetail, SESSION_DETAIL_SQL } from "./session-watch";

async function started(s: Sessions) {
  const plan = await pushWorkout(s);
  const id = await startSession(s.training, { workoutId: plan.workoutId, derivedTitle: "Legs" });
  const [squat, plank] = s.exercises(id).map((row) => String(row["id"]));
  const [warmup, work1, work2] = s.sets(squat ?? "").map((row) => String(row["id"]));
  return {
    id,
    plan,
    squat: squat ?? "",
    plank: plank ?? "",
    warmup: warmup ?? "",
    work1: work1 ?? "",
    work2: work2 ?? "",
  };
}

const targetsOf = (s: Sessions, sessionExerciseId: string) =>
  z
    .array(z.object({ target: z.string() }))
    .parse(
      s.sqlite
        .prepare(
          "SELECT target FROM session_set WHERE session_exercise_id = ? ORDER BY position, id",
        )
        .all(sessionExerciseId),
    )
    .map((row) => JSON.parse(row.target));

describe("replaceSessionExercise with nothing completed", () => {
  it("swaps in place: the same type keeps the sets, another type gets its defaults", async () => {
    const s = await setupSessions();
    const t = await started(s);
    expect(await replaceSessionExercise(s.training, t.squat, SQUAT)).toBeNull();
    expect(await replaceSessionExercise(s.training, t.squat, CURL)).toEqual({
      id: t.squat,
      split: false,
    });
    expect(s.one("session_exercise", t.squat)).toMatchObject({
      exercise_id: CURL,
      exercise_title: "Curl",
      source_workout_exercise_id: expect.any(String),
    });
    expect(s.sets(t.squat).map((row) => row["id"])).toEqual([t.warmup, t.work1, t.work2]);

    expect(await replaceSessionExercise(s.training, t.squat, PLANK)).toEqual({
      id: t.squat,
      split: false,
    });
    expect(s.one("session_exercise", t.squat)).toMatchObject({
      exercise_type: "duration",
      rest_seconds: 120,
    });
    expect(s.sets(t.squat)).toHaveLength(3);
    expect(targetsOf(s, t.squat)[0]).toEqual({ kind: "working", duration_s: 30 });
  });
});

describe("replaceSessionExercise after sets were ticked", () => {
  it("keeps the ticked sets on the original and gives the new exercise the rest", async () => {
    const s = await setupSessions();
    const t = await started(s);
    await tickSet(s.training, t.warmup, { weight: 40, reps: 10 });
    await tickSet(s.training, t.work1, { weight: 100, reps: 5 });
    const swap = await replaceSessionExercise(s.training, t.squat, CURL);
    expect(swap).toMatchObject({ split: true });
    const newId = swap?.id ?? "";
    expect(newId).not.toBe(t.squat);

    // The original is untouched apart from losing its unticked set.
    expect(s.one("session_exercise", t.squat)).toMatchObject({
      exercise_id: SQUAT,
      exercise_title: "Squat",
    });
    expect(s.sets(t.squat).map((row) => row["id"])).toEqual([t.warmup, t.work1]);
    expect(s.one("session_set", t.work1)).toMatchObject({ weight_kg: 100, reps: 5 });

    // The new exercise sits right after it and has one unticked set: the old working set minus load.
    expect(s.exercises(t.id).map((row) => row["id"])).toEqual([t.squat, newId, t.plank]);
    expect(s.one("session_exercise", newId)).toMatchObject({
      exercise_id: CURL,
      exercise_title: "Curl",
      exercise_type: "weight_reps",
    });
    const sets = s.sets(newId);
    expect(sets).toHaveLength(1);
    expect(sets[0]).toMatchObject({ completed_at: null, weight_kg: null });
    expect(targetsOf(s, newId)[0]).toEqual({
      kind: "working",
      reps_min: 5,
      reps_max: 8,
      effort_min: 8,
      effort_max: 8,
    });
  });

  it("preserves the kind of an unticked set edited after the session started", async () => {
    const s = await setupSessions();
    const t = await started(s);
    await tickSet(s.training, t.warmup, { weight: 40, reps: 10 });
    await tickSet(s.training, t.work1, { weight: 100, reps: 5 });
    await updateSet(s.training, t.work2, { kind: "warmup" });

    const swap = await replaceSessionExercise(s.training, t.squat, CURL);
    expect(s.sets(swap?.id ?? "")[0]).toMatchObject({ kind: "warmup" });
    expect(targetsOf(s, swap?.id ?? "")[0]).toMatchObject({ kind: "warmup" });
  });

  it("re-types the remaining sets when the type differs and keeps the superset", async () => {
    const s = await setupSessions();
    const t = await started(s);
    const group = "0192f0a0-0000-7000-8000-0000000000c1";
    s.sqlite
      .prepare("UPDATE session_exercise SET superset_group = ?, rest_seconds = ? WHERE id = ?")
      .run(group, null, t.squat);
    s.sqlite
      .prepare("UPDATE session_exercise SET superset_group = ?, rest_seconds = 90 WHERE id = ?")
      .run(group, t.plank);
    await tickSet(s.training, t.work1, { weight: 100, reps: 5 });
    const swap = await replaceSessionExercise(s.training, t.squat, PLANK);
    const newId = swap?.id ?? "";
    expect(s.exercises(t.id).map((row) => row["id"])).toEqual([t.squat, newId, t.plank]);
    expect(s.exercises(t.id).map((row) => row["superset_group"])).toEqual([group, group, group]);
    expect(s.one("session_exercise", newId)).toMatchObject({ exercise_type: "duration" });
    // Two unticked sets of the squat (warm-up skipped when the type differs) become 30 s targets.
    expect(targetsOf(s, newId)).toEqual([{ kind: "working", duration_s: 30 }]);
  });

  it("seeds targets from the new exercise's own latest finished Session", async () => {
    const s = await setupSessions();
    const past = await startSession(s.training, { workoutId: null, derivedTitle: "Arms" });
    const [curl] = await addSessionExercises(s.training, past, [CURL]);
    const [first] = s.sets(curl ?? "").map((row) => String(row["id"]));
    await tickSet(s.training, first ?? "", { weight: 20, reps: 12 });
    await finishSession(s.training, past, {});

    const warmups = await startSession(s.training, { workoutId: null, derivedTitle: "Warm-ups" });
    const [warmupCurl] = await addSessionExercises(s.training, warmups, [CURL]);
    const [warmup] = s.sets(warmupCurl ?? "").map((row) => String(row["id"]));
    await updateSet(s.training, warmup ?? "", { kind: "warmup" });
    await tickSet(s.training, warmup ?? "", { weight: 5, reps: 15 });
    await finishSession(s.training, warmups, {});

    const t = await started(s);
    await tickSet(s.training, t.warmup, { weight: 40, reps: 10 });
    const swap = await replaceSessionExercise(s.training, t.squat, CURL);
    expect(targetsOf(s, swap?.id ?? "")).toEqual([
      { kind: "working", weight_kg: 20, reps_min: 12, reps_max: 12 },
      { kind: "working", weight_kg: 20, reps_min: 12, reps_max: 12 },
    ]);
  });

  it("gives the new exercise default sets when everything was ticked", async () => {
    const s = await setupSessions();
    const t = await started(s);
    for (const id of [t.warmup, t.work1, t.work2]) {
      await tickSet(s.training, id, { weight: 50, reps: 5 });
    }
    const swap = await replaceSessionExercise(s.training, t.squat, CURL);
    expect(s.sets(t.squat)).toHaveLength(3);
    expect(s.sets(swap?.id ?? "")).toHaveLength(3);
  });
});

describe("swap scope", () => {
  it("refuses a workout swap when its source workout is gone", async () => {
    const s = await setupSessions();
    const t = await started(s);
    s.sqlite.prepare("DELETE FROM workout WHERE id = ?").run(t.plan.workoutId);

    await expect(
      replaceSessionExercise(s.training, t.squat, CURL, undefined, s.installId, "workout"),
    ).rejects.toThrow();
    expect(s.one("session_exercise", t.squat)).toMatchObject({ exercise_id: SQUAT });
    expect(s.exercises(t.id)).toHaveLength(2);
  });

  it("rolls back the session swap when the workout write fails", async () => {
    const s = await setupSessions();
    const t = await started(s);
    await tickSet(s.training, t.work1, { weight: 100, reps: 5 });
    s.sqlite.exec(`CREATE TRIGGER fail_workout_swap BEFORE UPDATE OF exercise_id ON workout_exercise
      BEGIN SELECT RAISE(ABORT, 'workout write refused'); END`);

    await expect(
      replaceSessionExercise(s.training, t.squat, CURL, undefined, s.installId, "workout"),
    ).rejects.toThrow("workout write refused");
    expect(s.exercises(t.id)).toHaveLength(2);
    expect(s.sets(t.squat)).toHaveLength(3);
    expect(s.one("workout_exercise", t.plan.squat)).toMatchObject({ exercise_id: SQUAT });
  });

  it.each(["session", "workout"] as const)(
    "keeps the completed fragment in history through finish with %s scope",
    async (scope) => {
      const s = await setupSessions();
      const t = await started(s);
      await tickSet(s.training, t.work1, { weight: 100, reps: 5 });
      const swap = await replaceSessionExercise(
        s.training,
        t.squat,
        CURL,
        undefined,
        s.installId,
        scope,
      );
      const replacement = s.sets(swap?.id ?? "")[1];
      await tickSet(s.training, String(replacement?.["id"]), { weight: 20, reps: 8 });
      await finishSession(s.training, t.id, {});

      const detail = parseSessionDetail(s.sqlite.prepare(SESSION_DETAIL_SQL).all(t.id));
      expect(detail?.exercises.map((entry) => entry.exerciseId)).toEqual([SQUAT, CURL]);
      const source = {
        exercises: [
          { id: t.plan.squat, exerciseId: scope === "workout" ? CURL : SQUAT, sets: [] },
          { id: t.plan.plank, exerciseId: PLANK, sets: [] },
        ],
      };
      if (!detail) throw new Error("Session missing after finish");
      const diff = diffSessionAgainstWorkout(detail, source);
      if (scope === "workout") {
        expect(diff.structure).not.toContainEqual(expect.objectContaining({ exerciseId: SQUAT }));
      } else {
        expect(diff.structure).toContainEqual({ kind: "added", exerciseId: CURL });
        expect(s.one("workout_exercise", t.plan.squat)).toMatchObject({ exercise_id: SQUAT });
      }

      await applySessionWorkout(s.training, t.id, {
        structure: true,
        targets: false,
        saveNew: false,
      });
      const planned = s.all("workout_exercise").map((entry) => entry["exercise_id"]);
      expect(planned.sort()).toEqual(
        (scope === "workout" ? [CURL, PLANK] : [SQUAT, CURL, PLANK]).sort(),
      );
      expect(s.one("session_set", t.work1)).toMatchObject({ weight_kg: 100, reps: 5 });
    },
  );
});

describe("swapTargets", () => {
  const working = { kind: "working", reps_min: 5, reps_max: 8, weight_kg: 100 } as const;
  it("drops the load of the exercise swapped out and warm-ups of another type", () => {
    expect(
      swapTargets({
        old: [{ kind: "warmup", weight_kg: 40 }, working],
        sameType: true,
        type: "weight_reps",
        baseline: [],
      }),
    ).toEqual([{ kind: "warmup" }, { kind: "working", reps_min: 5, reps_max: 8 }]);
    expect(
      swapTargets({
        old: [{ kind: "warmup", weight_kg: 40 }, working],
        sameType: false,
        type: "duration",
        baseline: [],
      }),
    ).toEqual([{ kind: "working", duration_s: 30 }]);
  });
});
