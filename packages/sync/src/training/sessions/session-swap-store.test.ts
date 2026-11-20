import { describe, expect, it } from "vitest";
import { z } from "zod";

import { CURL, PLANK, SQUAT, pushWorkout, setupSessions, type Sessions } from "./session-fixtures";
import { addSessionExercises, tickSet } from "./session-content-store";
import { replaceSessionExercise, swapTargets } from "./session-swap-store";
import { finishSession, startSession } from "./session-store";

async function started(s: Sessions) {
  const plan = await pushWorkout(s);
  const id = await startSession(s.training, { workoutId: plan.workoutId, derivedTitle: "Legs" });
  const [squat, plank] = s.exercises(id).map((row) => String(row["id"]));
  const [warmup, work1, work2] = s.sets(squat ?? "").map((row) => String(row["id"]));
  return {
    id,
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
