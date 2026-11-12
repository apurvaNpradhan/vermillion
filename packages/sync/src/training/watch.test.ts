import { describe, expect, it } from "vitest";

import { claimDeviceOwner } from "../platform/device-owner";
import { createFakeDatabase } from "../platform/fake-database";
import {
  addExercises,
  addSlot,
  createProgram,
  createWorkout,
  moveWorkoutExercise,
  removeWorkoutExercise,
  restoreWorkoutExercise,
  setProgramCover,
  updateWorkoutExercise,
  type TrainingDatabase,
} from "./store";
import {
  LATEST_EXERCISE_PLAN_SQL,
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
  const input = { title: "Upper Lower", description: "# Plan", planned_weeks: 8 };

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
    const second = await createProgram(training, { ...input, title: "Empty", planned_weeks: null });
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
  it("shows the local cover in the Program list and detail, null without one", async () => {
    const { training, programs, program } = await setup();
    const id = await createProgram(training, {
      title: "PPL",
      description: "Hi",
      planned_weeks: null,
    });
    expect(programs()[0]?.coverUri).toBeNull();
    await setProgramCover(training, id, "file:///covers/x.jpg");
    expect(programs()[0]?.coverUri).toBe("file:///covers/x.jpg");
    expect(program(id)?.coverUri).toBe("file:///covers/x.jpg");
  });

  it("reads a Workout and a whole Program plan once, for sharing", async () => {
    const { training } = await setup();
    const programId = await createProgram(training, {
      title: "PPL",
      description: "A split",
      planned_weeks: null,
    });
    const workoutId = await createWorkout(training, { program_id: programId, title: "Push" });
    await addExercises(training, workoutId, [SQUAT, PLANK]);
    await addSlot(training, programId, workoutId);
    await addSlot(training, programId, null);
    expect((await readWorkoutDetail(training, workoutId))?.exercises).toHaveLength(2);
    expect(await readWorkoutDetail(training, "missing")).toBeNull();
    const plan = await readProgramPlan(training, programId);
    expect(plan?.title).toBe("PPL");
    expect(plan?.slots.map((slot) => slot.workout?.title ?? null)).toEqual(["Push", null]);
    expect(await readProgramPlan(training, "missing")).toBeNull();
  });
});

it("selects the latest surviving Workout prescription for the exercise", async () => {
  const s = await setup();
  expect(s.sqlite.prepare(LATEST_EXERCISE_PLAN_SQL).all(SQUAT)).toEqual([]);
  const older = await createWorkout(s.training);
  const [oldEntry] = await addExercises(s.training, older, [SQUAT]);
  const newer = await createWorkout(s.training);
  const [newEntry] = await addExercises(s.training, newer, [SQUAT]);
  s.sqlite.prepare("UPDATE workout SET created_at = ? WHERE id = ?").run("2026-01-01", older);
  s.sqlite.prepare("UPDATE workout SET created_at = ? WHERE id = ?").run("2026-02-01", newer);
  const targets = [{ kind: "working", weight_kg: 80, reps_min: 8, reps_max: 12 }] as const;
  await updateWorkoutExercise(s.training, newEntry!, { sets: [...targets] });
  const rows = () => s.sqlite.prepare(LATEST_EXERCISE_PLAN_SQL).all(SQUAT);
  expect(JSON.parse(String(rows()[0]?.["sets"]))).toEqual(targets);
  await removeWorkoutExercise(s.training, newEntry!);
  expect(rows()).toEqual([
    {
      sets: String(
        s.sqlite.prepare("SELECT sets FROM workout_exercise WHERE id = ?").get(oldEntry!)?.["sets"],
      ),
    },
  ]);
});
