import { describe, expect, it } from "vitest";

import { claimDeviceOwner } from "../platform/device-owner";
import { createFakeDatabase } from "../platform/fake-database";
import { pushWorkout, setupSessions } from "./sessions/session-fixtures";
import { startSession } from "./sessions/session-store";
import { setExerciseSetting } from "./sessions/equipment-store";
import {
  addExercises,
  addSlot,
  createProgram,
  createWorkout,
  moveWorkoutExercise,
  removeWorkoutExercise,
  restoreWorkoutExercise,
  setProgramCoverToNewMedia,
  updateWorkout,
  updateWorkoutExercise,
  type TrainingDatabase,
} from "./store";
import {
  EXERCISE_PLAN_SQL,
  PROGRAM_DETAIL_SQL,
  PROGRAM_LIST_SQL,
  WORKOUT_DETAIL_SQL,
  WORKOUT_LIST_SQL,
  parseProgramDetail,
  parseProgramList,
  parseWorkoutDetail,
  parseWorkoutList,
  readExerciseType,
  readProgramPlan,
  readWorkoutDetail,
  watchSession,
  watchWorkouts,
  type WorkoutSummary,
} from "./watch";

const SQUAT = "0192f0a0-0000-7000-8000-000000000001";
const PLANK = "0192f0a0-0000-7000-8000-000000000003";

async function setup() {
  const fake = createFakeDatabase();
  await claimDeviceOwner(fake.database, "owner");
  const insert = fake.sqlite.prepare(
    `INSERT INTO exercise (id, user_id, title, primary_muscle, secondary_muscles, equipment,
       exercise_type, is_full_bodyweight, created_at) VALUES (?, NULL, ?, ?, ?, ?, ?, 0, 'now')`,
  );
  insert.run(SQUAT, "Squat", "quadriceps", '["glutes"]', "barbell", "weight_reps");
  insert.run(PLANK, "Plank", "abdominals", "[]", "none", "duration");
  // Safety: the fake implements the database methods the store calls.
  const training = fake.database as never as TrainingDatabase;
  const detail = (id: string) =>
    parseWorkoutDetail(fake.sqlite.prepare(WORKOUT_DETAIL_SQL).all(id));
  const list = () => parseWorkoutList(fake.sqlite.prepare(WORKOUT_LIST_SQL).all());
  const programs = () => parseProgramList(fake.sqlite.prepare(PROGRAM_LIST_SQL).all());
  const program = (id: string) =>
    parseProgramDetail(fake.sqlite.prepare(PROGRAM_DETAIL_SQL).all(id));
  return { ...fake, training, detail, list, programs, program };
}

describe("workout reads", () => {
  it("lists Workouts newest first with their exercises, and an empty one with none", async () => {
    const { training, list } = await setup();
    const first = await createWorkout(training);
    await new Promise((resolve) => setTimeout(resolve, 2));
    const second = await createWorkout(training, { title: "Legs" });
    await addExercises(training, second, [SQUAT, PLANK]);
    const rows = list();
    expect(rows.map((row) => row.id)).toEqual([second, first]);
    expect(rows[0]?.title).toBe("Legs");
    expect(rows[0]?.exercises.map((entry) => entry.primaryMuscle)).toEqual([
      "quadriceps",
      "abdominals",
    ]);
    expect(rows[0]?.exercises[0]?.sets).toHaveLength(3);
    expect(rows[0]?.exercises.map((entry) => entry.title)).toEqual(["Squat", "Plank"]);
    expect(rows[0]?.exercises[0]?.thumbnailKey).toBeNull();
    expect(rows[0]?.exercises.map((entry) => entry.secondaryMuscles)).toEqual([["glutes"], []]);
    expect(rows[1]?.exercises).toEqual([]);
  });

  it("finds a Program workout by ownership and adds an exercise to that workout", async () => {
    const { training, detail } = await setup();
    const programId = await createProgram(training, {
      title: "Three days",
      description: null,
      planned_weeks: null,
    });
    const standalone = await createWorkout(training, { title: "Push" });
    const programWorkout = await createWorkout(training, { title: "Push", program_id: programId });
    await addSlot(training, programId, programWorkout);

    let rows: WorkoutSummary[] = [];
    const stop = watchWorkouts(
      training,
      {
        onWorkouts: (workouts) => {
          rows = workouts;
        },
        onError: (error) => {
          throw error;
        },
      },
      { includeProgramWorkouts: true },
    );
    try {
      expect(rows.find((workout) => workout.id === standalone)?.programId).toBeNull();
      expect(rows.find((workout) => workout.id === programWorkout)?.programId).toBe(programId);
      await addExercises(training, programWorkout, [SQUAT]);
      expect(detail(programWorkout)?.exercises.map((entry) => entry.exerciseId)).toEqual([SQUAT]);
      expect(detail(standalone)?.exercises).toEqual([]);
    } finally {
      stop();
    }
  });

  it("reads one Workout with ordered exercises, moves and sets included", async () => {
    const { training, detail } = await setup();
    const id = await createWorkout(training);
    const [squat, plank] = await addExercises(training, id, [SQUAT, PLANK]);
    await moveWorkoutExercise(training, plank ?? "", squat ?? "");
    await updateWorkoutExercise(training, plank ?? "", { rest_seconds: null, note: "Slow" });
    const read = detail(id);
    expect(read?.exercises.map((entry) => entry.exercise?.title)).toEqual(["Plank", "Squat"]);
    expect(read?.exercises[0]).toMatchObject({ restSeconds: null, note: "Slow" });
    expect(read?.exercises[1]?.exercise?.secondaryMuscles).toEqual(["glutes"]);
    expect(read?.exercises[1]?.exercise?.progressionPerSet).toBe(false);
    await setExerciseSetting(training, SQUAT, { progression_per_set: true });
    expect(detail(id)?.exercises[1]?.exercise?.progressionPerSet).toBe(true);
    expect(detail("missing")).toBeNull();
  });

  it("puts a removed exercise back where it was", async () => {
    const { training, detail } = await setup();
    const id = await createWorkout(training);
    await addExercises(training, id, [SQUAT, PLANK]);
    const before = detail(id)?.exercises ?? [];
    const first = before[0];
    if (!first) throw new Error("seeded");
    await removeWorkoutExercise(training, first.id);
    expect(detail(id)?.exercises).toHaveLength(1);
    const restored = await restoreWorkoutExercise(training, {
      id: first.id,
      workout_id: first.workoutId,
      exercise_id: first.exerciseId,
      position: first.position,
      rest_seconds: first.restSeconds,
      note: first.note,
      superset_group: first.supersetGroup,
      sets: first.sets,
    });
    expect(restored).toBe(true);
    expect(detail(id)?.exercises.map((entry) => entry.id)).toEqual(before.map((entry) => entry.id));
  });

  it("reads an exercise type", async () => {
    const { training } = await setup();
    expect(await readExerciseType(training, PLANK)).toBe("duration");
    expect(await readExerciseType(training, "nope")).toBeNull();
  });
});

describe("program reads", () => {
  const input = {
    title: "Upper Lower",
    description: "# Plan",
    planned_weeks: 8,
    sessions_per_week: null,
  };

  it("keeps Program Workouts out of the standalone list", async () => {
    const { training, list } = await setup();
    const programId = await createProgram(training, input);
    await createWorkout(training, { program_id: programId, title: "Upper" });
    const alone = await createWorkout(training, { title: "Alone" });
    expect(list().map((row) => row.id)).toEqual([alone]);
  });

  it("lists Programs newest first with their Slots in order", async () => {
    const { training, programs } = await setup();
    const first = await createProgram(training, input);
    await new Promise((resolve) => setTimeout(resolve, 2));
    const second = await createProgram(training, {
      ...input,
      title: "Empty",
      planned_weeks: null,
      sessions_per_week: null,
    });
    const upper = await createWorkout(training, { program_id: first, title: "Upper" });
    const a = await addSlot(training, first, upper);
    const rest = await addSlot(training, first, null);
    const b = await addSlot(training, first, upper);
    await addExercises(training, upper, [PLANK, SQUAT]);
    const rows = programs();
    expect(rows.map((row) => row.id)).toEqual([second, first]);
    expect(rows[0]).toMatchObject({
      title: "Empty",
      plannedWeeks: null,
      slots: [],
    });
    expect(rows[1]?.slots).toEqual([
      { id: a, workoutId: upper },
      { id: rest, workoutId: null },
      { id: b, workoutId: upper },
    ]);
  });

  it("reads one Program with Workout slots, Rest and repeats", async () => {
    const { training, program } = await setup();
    const id = await createProgram(training, input);
    const upper = await createWorkout(training, { program_id: id, title: "Upper" });
    await addExercises(training, upper, [SQUAT, PLANK]);
    const a = await addSlot(training, id, upper);
    const rest = await addSlot(training, id, null);
    const b = await addSlot(training, id, upper);
    const read = program(id);
    expect(read).toMatchObject({ title: "Upper Lower", description: "# Plan", plannedWeeks: 8 });
    expect(read?.slots.map((slot) => slot.id)).toEqual([a, rest, b]);
    expect(read?.slots[1]?.workout).toBeNull();
    expect(read?.slots[0]?.workout?.exercises.map((entry) => entry.primaryMuscle)).toEqual([
      "quadriceps",
      "abdominals",
    ]);
    expect(read?.slots[2]?.workout?.title).toBe("Upper");
    expect(program("missing")).toBeNull();
  });

  it("reads a Program with an empty Rotation", async () => {
    const { training, program } = await setup();
    const id = await createProgram(training, input);
    expect(program(id)?.slots).toEqual([]);
  });
});

describe("covers and plans", () => {
  it("shows the cover media in the Program list and detail, null without one", async () => {
    const { training, programs, program } = await setup();
    const id = await createProgram(training, {
      title: "PPL",
      description: "Hi",
      planned_weeks: null,
      sessions_per_week: null,
    });
    expect(programs()[0]?.coverMediaId).toBeNull();
    const { mediaId } = await setProgramCoverToNewMedia(training, id, {
      width: 100,
      height: 100,
      bytes: 10,
      thumbBytes: 5,
    });
    expect(programs()[0]?.coverMediaId).toBe(mediaId);
    expect(program(id)?.coverMediaId).toBe(mediaId);
  });

  it("reads a Workout and a whole Program plan once, for sharing", async () => {
    const { training } = await setup();
    const programId = await createProgram(training, {
      title: "PPL",
      description: "A split",
      planned_weeks: null,
      sessions_per_week: null,
    });
    const workoutId = await createWorkout(training, { program_id: programId, title: "Push" });
    await addExercises(training, workoutId, [SQUAT, PLANK]);
    await addSlot(training, programId, workoutId);
    await addSlot(training, programId, null);
    expect((await readWorkoutDetail(training, workoutId))?.exercises).toHaveLength(2);
    expect(await readWorkoutDetail(training, "missing")).toBeNull();
    const plan = await readProgramPlan(training, programId);
    expect(plan?.title).toBe("PPL");
    expect(plan?.plannedWeeks).toBeNull();
    expect(plan?.coverMediaId).toBeNull();
    expect(plan?.slots.map((slot) => slot.workout?.title ?? null)).toEqual(["Push", null]);
    expect(plan?.slots.map((slot) => slot.workoutId)).toEqual([workoutId, null]);
    expect(await readProgramPlan(training, "missing")).toBeNull();
  });
});

it("selects the first candidate still planning the exercise", async () => {
  const s = await setup();
  const trained = await createWorkout(s.training);
  await addExercises(s.training, trained, [SQUAT]);
  const upcoming = await createWorkout(s.training);
  const [entry] = await addExercises(s.training, upcoming, [SQUAT]);
  if (!entry) throw new Error("Expected an upcoming squat");
  const unrelated = await createWorkout(s.training);
  await addExercises(s.training, unrelated, [SQUAT]);
  const plan = (...ids: string[]) =>
    parseWorkoutDetail(s.sqlite.prepare(EXERCISE_PLAN_SQL).all(JSON.stringify(ids), SQUAT));
  expect(plan()).toBeNull();
  expect(plan(trained)?.id).toBe(trained);
  expect(plan(upcoming, trained)?.id).toBe(upcoming);
  await removeWorkoutExercise(s.training, entry);
  expect(plan(upcoming, trained)?.id).toBe(trained);
});

it("refreshes session detail after only the workout note changes", async () => {
  const s = await setupSessions();
  const { workoutId } = await pushWorkout(s);
  const id = await startSession(s.training, { workoutId, derivedTitle: "Legs" });
  const notes: (string | null)[] = [];
  const stop = watchSession(s.training, id, {
    onSession: (session) => notes.push(session?.workoutNote ?? null),
    onError: (error) => {
      throw error;
    },
  });
  await updateWorkout(s.training, workoutId, { note: "Keep the same pace" });
  s.notifyTable("workout");
  stop();
  expect(notes).toEqual([null, "Keep the same pace"]);
});
