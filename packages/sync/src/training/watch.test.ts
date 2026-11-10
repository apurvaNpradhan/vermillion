import { describe, expect, it } from "vitest";

import { claimDeviceOwner } from "../platform/device-owner";
import { createFakeDatabase } from "../platform/fake-database";
import {
  addExercises,
  createWorkout,
  moveWorkoutExercise,
  removeWorkoutExercise,
  restoreWorkoutExercise,
  updateWorkoutExercise,
  type TrainingDatabase,
} from "./store";
import {
  WORKOUT_DETAIL_SQL,
  WORKOUT_LIST_SQL,
  parseWorkoutDetail,
  parseWorkoutList,
  readExerciseType,
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
  return { ...fake, training, detail, list };
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
