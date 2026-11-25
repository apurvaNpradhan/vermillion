import { KG_PER_LB, insertedDeloadsSchema, type PhasePlanInput } from "@workspace/shared";
import { expect, it } from "vitest";
import { z } from "zod";

import { savePreferences } from "../../preferences";
import { setGymExerciseSetting } from "../gyms/gym-store";
import { activateProgram, finishRun, insertDeloadNow, readRuns } from "../plans/run-store";
import {
  addExercises,
  addSlot,
  copyWorkout,
  createProgram,
  createWorkout,
  updateProgram,
  updateWorkout,
  updateWorkoutExercise,
} from "../store";
import { CURL, DIP, PUSHUP, SQUAT, setupSessions, type Sessions } from "./session-fixtures";
import { upsertEquipment } from "./equipment-store";
import { finishSession, startSession } from "./session-store";
import { tickSet, updateSet } from "./session-content-store";

const DAY = 86_400_000;

const sets = (count: number) =>
  Array.from({ length: count }, () => ({
    kind: "working" as const,
    reps_min: 6,
    reps_max: 8,
    weight_kg: 100,
    effort_min: 8 as const,
    effort_max: 8 as const,
  }));

/** A Program of one Workout (a squat and a curl, four sets each) with a Run, phases optional. */
async function setup(s: Sessions, plan: PhasePlanInput | null) {
  const programId = await createProgram(s.training, {
    title: "Plan",
    description: null,
    planned_weeks: null,
    sessions_per_week: null,
    phase_plan:
      plan === null ? null : { overrides: [], modifiers: {}, test_top: "single", ...plan },
  });
  const workoutId = await createWorkout(s.training, { title: "Day", program_id: programId });
  const [squat = "", curl = ""] = await addExercises(s.training, workoutId, [SQUAT, CURL]);
  await updateWorkoutExercise(s.training, squat, { sets: sets(4) });
  await updateWorkoutExercise(s.training, curl, { sets: sets(4) });
  await addSlot(s.training, programId, workoutId);
  const runId = await activateProgram(s.training, programId);
  return { programId, workoutId, squat, curl, runId };
}

/** Starts a Session as if the Run began `weeksAgo` weeks ago. */
async function startInWeek(s: Sessions, runId: string, workoutId: string, week: number) {
  s.sqlite
    .prepare("UPDATE program_run SET started_at = ? WHERE id = ?")
    .run(new Date(Date.now() - (week - 1) * 7 * DAY - 60_000).toISOString(), runId);
  return await startSession(s.training, { workoutId, derivedTitle: "Day", timeZone: "UTC" });
}

const exerciseRow = z.object({ id: z.string(), exercise_id: z.string() });
const setRow = z.object({ target: z.string() });

/** The Planned-set targets each exercise of a Session carries, by exercise id. */
function targetsOf(s: Sessions, sessionId: string) {
  const byExercise = new Map<string, { kind: string; weight_kg?: number; effort_min?: number }[]>();
  for (const row of z.array(exerciseRow).parse(s.exercises(sessionId))) {
    byExercise.set(
      row.exercise_id,
      z
        .array(setRow)
        .parse(s.sets(row.id))
        .map((set) => JSON.parse(set.target)),
    );
  }
  return byExercise;
}

const phaseOf = (s: Sessions, id: string) =>
  z.object({ phase: z.string().nullable() }).parse(s.one("training_session", id)).phase;

it.each<[string, number, string, number, number | undefined, number | undefined]>([
  // week, phase, working sets of an accessory, weight, effort
  ["week 1 of build, build, deload", 1, "build", 4, 100, 8],
  ["week 2", 2, "build", 4, 100, 8],
  ["week 3 is the deload", 3, "deload", 2, 90, 6],
  ["week 4 repeats the pattern", 4, "build", 4, 100, 8],
])("%s", async (_name, week, phase, count, weight, effort) => {
  const s = await setupSessions();
  try {
    const { workoutId, runId } = await setup(s, { pattern: ["build", "build", "deload"] });
    const id = await startInWeek(s, runId, workoutId, week);
    expect(phaseOf(s, id)).toBe(phase);
    const curl = targetsOf(s, id).get(CURL) ?? [];
    expect(curl).toHaveLength(count);
    expect(curl[0]).toMatchObject({ weight_kg: weight, effort_min: effort });
  } finally {
    s.sqlite.close();
  }
});

it("reads the Workout, not the Session, for a plan: the Workout is unchanged", async () => {
  const s = await setupSessions();
  try {
    const { workoutId, runId, curl } = await setup(s, { pattern: ["deload"] });
    await startInWeek(s, runId, workoutId, 1);
    const stored = JSON.parse(
      z.object({ sets: z.string() }).parse(s.one("workout_exercise", curl)).sets,
    );
    expect(stored).toHaveLength(4);
    expect(stored[0]).toMatchObject({ weight_kg: 100, effort_min: 8 });
  } finally {
    s.sqlite.close();
  }
});

it("makes the main lift one top set in a Test week, and the first exercise by default", async () => {
  const s = await setupSessions();
  try {
    const { workoutId, runId, curl } = await setup(s, { pattern: ["test"] });
    const first = await startInWeek(s, runId, workoutId, 1);
    expect(phaseOf(s, first)).toBe("test");
    const targets = targetsOf(s, first);
    expect(targets.get(SQUAT)).toEqual([{ kind: "top", reps_min: 1, reps_max: 1, weight_kg: 100 }]);
    expect(targets.get(CURL)).toHaveLength(2);
    // Changing the main lift per Workout moves the top set to it.
    await updateWorkout(s.training, workoutId, { main_entry_id: curl });
    const second = await startInWeek(s, runId, workoutId, 1);
    const moved = targetsOf(s, second);
    expect(moved.get(CURL)).toEqual([{ kind: "top", reps_min: 1, reps_max: 1, weight_kg: 100 }]);
    expect(moved.get(SQUAT)).toHaveLength(2);
  } finally {
    s.sqlite.close();
  }
});

it("does an AMRAP top set when the plan says so", async () => {
  const s = await setupSessions();
  try {
    const { workoutId, runId } = await setup(s, { pattern: ["test"], test_top: "amrap" });
    const id = await startInWeek(s, runId, workoutId, 1);
    expect(targetsOf(s, id).get(SQUAT)).toEqual([
      { kind: "failure", reps_min: 6, reps_max: 8, weight_kg: 100 },
    ]);
  } finally {
    s.sqlite.close();
  }
});

it("uses a plan's own modifiers", async () => {
  const s = await setupSessions();
  try {
    const { workoutId, runId } = await setup(s, {
      pattern: ["deload"],
      modifiers: { deload: { sets: 0.75, rpe: -1, load: 0.8 } },
    });
    const id = await startInWeek(s, runId, workoutId, 1);
    expect(targetsOf(s, id).get(CURL)).toHaveLength(3);
    expect(targetsOf(s, id).get(CURL)?.[0]).toMatchObject({ weight_kg: 80, effort_min: 7 });
  } finally {
    s.sqlite.close();
  }
});

it("has no phase without a plan, for a standalone Workout, or with no Run", async () => {
  const s = await setupSessions();
  try {
    const { workoutId, runId } = await setup(s, null);
    const none = await startInWeek(s, runId, workoutId, 3);
    expect(phaseOf(s, none)).toBeNull();
    expect(targetsOf(s, none).get(CURL)).toHaveLength(4);

    const standalone = await createWorkout(s.training, { title: "Free" });
    await addExercises(s.training, standalone, [CURL]);
    const free = await startSession(s.training, {
      workoutId: standalone,
      derivedTitle: "Free",
      timeZone: "UTC",
    });
    expect(phaseOf(s, free)).toBeNull();
  } finally {
    s.sqlite.close();
  }
});

it("a plan added later applies from the next Session, and clearing it ends the phases", async () => {
  const s = await setupSessions();
  try {
    const { programId, workoutId, runId } = await setup(s, null);
    await updateProgram(s.training, programId, {
      phase_plan: { pattern: ["deload"], overrides: [], modifiers: {}, test_top: "single" },
    });
    expect(phaseOf(s, await startInWeek(s, runId, workoutId, 1))).toBe("deload");
    await updateProgram(s.training, programId, { phase_plan: null });
    expect(phaseOf(s, await startInWeek(s, runId, workoutId, 1))).toBeNull();
  } finally {
    s.sqlite.close();
  }
});

it("inserts a deload now: this week becomes a Deload and the rest shifts by one", async () => {
  const s = await setupSessions();
  try {
    const { workoutId, runId } = await setup(s, { pattern: ["build", "build", "deload"] });
    expect(phaseOf(s, await startInWeek(s, runId, workoutId, 2))).toBe("build");
    expect(await insertDeloadNow(s.training, runId, 2)).toBe(true);
    const run = (await readRuns(s.training)).find((item) => item.id === runId);
    expect(run?.inserted_deloads).toEqual([2]);
    expect(phaseOf(s, await startInWeek(s, runId, workoutId, 2))).toBe("deload");
    // Week 3 now holds Program week 2, week 4 the plan's deload.
    expect(phaseOf(s, await startInWeek(s, runId, workoutId, 3))).toBe("build");
    expect(phaseOf(s, await startInWeek(s, runId, workoutId, 4))).toBe("deload");
    // The same week twice is a no-op.
    expect(await insertDeloadNow(s.training, runId, 2)).toBe(false);
    expect(
      insertedDeloadsSchema.safeParse((await readRuns(s.training))[0]?.inserted_deloads).success,
    ).toBe(true);
  } finally {
    s.sqlite.close();
  }
});

it("refuses to insert a deload into a finished Run", async () => {
  const s = await setupSessions();
  try {
    const { runId } = await setup(s, { pattern: ["build"] });
    await finishRun(s.training, runId);
    expect(await insertDeloadNow(s.training, runId, 1)).toBe(false);
    expect(await insertDeloadNow(s.training, "0192f0a0-0000-7000-8000-00000000dead", 1)).toBe(
      false,
    );
  } finally {
    s.sqlite.close();
  }
});

it("a copy of a Workout keeps its main lift, pointing at the copy's own exercise", async () => {
  const s = await setupSessions();
  try {
    const { workoutId, curl } = await setup(s, null);
    await updateWorkout(s.training, workoutId, { main_entry_id: curl });
    const copy = await copyWorkout(s.training, workoutId, null);
    const { main_entry_id: main } = z
      .object({ main_entry_id: z.string() })
      .parse(s.one("workout", copy));
    const entry = z
      .array(z.object({ id: z.string(), workout_id: z.string(), exercise_id: z.string() }))
      .parse(s.all("workout_exercise"))
      .find((row) => row.id === main);
    expect(entry).toMatchObject({ workout_id: copy, exercise_id: CURL });
    expect(main).not.toBe(curl);
  } finally {
    s.sqlite.close();
  }
});

it("rejects a phase plan that is not valid", async () => {
  const s = await setupSessions();
  try {
    const { programId } = await setup(s, null);
    await expect(
      updateProgram(s.training, programId, {
        phase_plan: { pattern: [], overrides: [], modifiers: {}, test_top: "single" },
      }),
    ).rejects.toThrow();
  } finally {
    s.sqlite.close();
  }
});

const HOME = "0192f0a0-0000-7000-8000-0000000000a1";
const deliverGym = (s: Sessions) =>
  s.sqlite
    .prepare("INSERT INTO gym (id, user_id, name, created_at) VALUES (?, 'owner', 'My gym', ?)")
    .run(HOME, "2026-11-01T00:00:00Z");

const lb = (kg: number) => Math.round((kg / KG_PER_LB) * 100) / 100;

it("lowers a Deload in the user's unit: 100 lb on a barbell becomes 90 lb", async () => {
  const s = await setupSessions();
  try {
    deliverGym(s);
    await savePreferences(
      s.training,
      { ui: { weightUnit: "lb" } },
      { installId: s.installId, owner: "owner" },
    );
    const { workoutId, runId, squat } = await setup(s, { pattern: ["deload"] });
    await updateWorkoutExercise(s.training, squat, {
      sets: [{ kind: "working", reps_min: 5, reps_max: 5, weight_kg: 100 * KG_PER_LB }],
    });
    const id = await startInWeek(s, runId, workoutId, 1);
    const [top] = targetsOf(s, id).get(SQUAT) ?? [];
    expect(lb(top?.weight_kg ?? 0)).toBe(90);
  } finally {
    s.sqlite.close();
  }
});

it("lowers a Deload onto the Session gym's load grid and keeps it under its cap", async () => {
  const s = await setupSessions();
  try {
    deliverGym(s);
    // A rack in steps of 5: 60 kg x 0.9 = 54 kg snaps down to 50 kg (the default rack gives 52.5).
    await setGymExerciseSetting(
      s.training,
      { gymId: HOME, exerciseId: CURL },
      { load_ranges: [{ min: 5, max: 50, step: 5 }] },
      s.installId,
    );
    const { workoutId, runId, curl } = await setup(s, { pattern: ["deload"] });
    await updateWorkoutExercise(s.training, curl, {
      sets: [{ kind: "working", reps_min: 8, reps_max: 8, weight_kg: 60 }],
    });
    const id = await startInWeek(s, runId, workoutId, 1);
    // 54 kg floors to 50 on the gym's steps; the planned 60 kg was past the gym's cap anyway.
    expect(targetsOf(s, id).get(CURL)?.[0]?.weight_kg).toBe(50);
  } finally {
    s.sqlite.close();
  }
});

it("keeps the modifiers it started with when the plan is edited later", async () => {
  const s = await setupSessions();
  try {
    const { programId, workoutId, runId } = await setup(s, { pattern: ["deload"] });
    const id = await startInWeek(s, runId, workoutId, 1);
    await updateProgram(s.training, programId, {
      phase_plan: {
        pattern: ["deload"],
        overrides: [],
        modifiers: { deload: { sets: 1, rpe: 0, load: 1 } },
        test_top: "amrap",
      },
    });
    const { phase_modifiers: stored } = z
      .object({ phase_modifiers: z.string() })
      .parse(s.one("training_session", id));
    expect(JSON.parse(stored)).toEqual({ sets: 0.5, rpe: -2, load: 0.9, test_top: "single" });
    // The snapshot survives finishing the Session.
    await finishSession(s.training, id);
    expect(
      z.object({ phase_modifiers: z.string() }).parse(s.one("training_session", id))
        .phase_modifiers,
    ).toBe(stored);
  } finally {
    s.sqlite.close();
  }
});

it("starts a Test week's top set from the last baseline's heaviest working set", async () => {
  const s = await setupSessions();
  try {
    const { workoutId, runId } = await setup(s, { pattern: ["build", "test"] });
    // Week 1 (a Build) lifts 120 kg, though the Workout still plans 100 kg.
    const build = await startInWeek(s, runId, workoutId, 1);
    const exercise = z
      .array(z.object({ id: z.string(), exercise_id: z.string() }))
      .parse(s.exercises(build))
      .find((row) => row.exercise_id === SQUAT);
    const rows = z.array(z.object({ id: z.string() })).parse(s.sets(exercise?.id ?? ""));
    await updateSet(s.training, rows[0]?.id ?? "", { weight_kg: 120, reps: 5 });
    await tickSet(s.training, rows[0]?.id ?? "", {});
    await finishSession(s.training, build);
    const test = await startInWeek(s, runId, workoutId, 2);
    expect(phaseOf(s, test)).toBe("test");
    expect(targetsOf(s, test).get(SQUAT)).toEqual([
      { kind: "top", reps_min: 1, reps_max: 1, weight_kg: 120 },
    ]);
  } finally {
    s.sqlite.close();
  }
});

it("is as many reps as possible for a lift with no weight in a Test week", async () => {
  const s = await setupSessions();
  try {
    const { workoutId, runId } = await setup(s, { pattern: ["test"] });
    const [pushup = ""] = await addExercises(s.training, workoutId, [PUSHUP]);
    await updateWorkoutExercise(s.training, pushup, {
      sets: [{ kind: "working", reps_min: 10, reps_max: 15 }],
    });
    await updateWorkout(s.training, workoutId, { main_entry_id: pushup });
    const id = await startInWeek(s, runId, workoutId, 1);
    expect(targetsOf(s, id).get(PUSHUP)).toEqual([{ kind: "failure", reps_min: 10, reps_max: 15 }]);
  } finally {
    s.sqlite.close();
  }
});

it("keeps an assisted lift's assistance in a Deload and a Test, which is AMRAP", async () => {
  const s = await setupSessions();
  try {
    const assisted = [30, 20, 15].map((weight_kg) => ({
      kind: "working" as const,
      reps_min: 8,
      reps_max: 10,
      weight_kg,
    }));
    const { workoutId, runId } = await setup(s, { pattern: ["deload", "test"] });
    const [dip = ""] = await addExercises(s.training, workoutId, [DIP]);
    await updateWorkoutExercise(s.training, dip, { sets: assisted });
    const deload = targetsOf(s, await startInWeek(s, runId, workoutId, 1)).get(DIP) ?? [];
    expect(deload.map((set) => set.weight_kg)).toEqual([30, 20]);
    await updateWorkout(s.training, workoutId, { main_entry_id: dip });
    const test = targetsOf(s, await startInWeek(s, runId, workoutId, 2)).get(DIP) ?? [];
    expect(test).toEqual([{ kind: "failure", reps_min: 8, reps_max: 10, weight_kg: 30 }]);
  } finally {
    s.sqlite.close();
  }
});

it("loads a Test top set on the bar the screens pick: the heaviest of the unlisted bars", async () => {
  const s = await setupSessions();
  try {
    deliverGym(s);
    const item = { unit: "kg", label: null, enabled: true } as const;
    // Inserted lightest first: the order of the rows must not choose the bar.
    await upsertEquipment(s.training, [
      { ...item, kind: "bar", weight_kg: 7, count: null },
      { ...item, kind: "bar", weight_kg: 15, count: null },
      { ...item, kind: "plate", weight_kg: 10, count: 8 },
    ]);
    const { workoutId, runId } = await setup(s, { pattern: ["test"] });
    const id = await startInWeek(s, runId, workoutId, 1);
    // The 15 kg bar loads 15, 35, 55, 75, 95 kg (a 7 kg bar would give 87 kg).
    expect(targetsOf(s, id).get(SQUAT)?.[0]?.weight_kg).toBe(95);
  } finally {
    s.sqlite.close();
  }
});
