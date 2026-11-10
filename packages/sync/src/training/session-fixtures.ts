import { claimDeviceOwner } from "../platform/device-owner";
import { createFakeDatabase } from "../platform/fake-database";
import { ensureInstallId } from "../platform/install-meta";
import { addExercises, createWorkout, updateWorkoutExercise, type TrainingDatabase } from "./store";

export const SQUAT = "0192f0a0-0000-7000-8000-000000000001";
export const CURL = "0192f0a0-0000-7000-8000-000000000002";
export const PLANK = "0192f0a0-0000-7000-8000-000000000003";
export const PUSHUP = "0192f0a0-0000-7000-8000-000000000004";
export const DIP = "0192f0a0-0000-7000-8000-000000000005";

/** `never` converts to any type, so the one assertion at the call site carries the SAFETY note. */
function asTrainingDatabase(double: never): TrainingDatabase {
  return double;
}

/** A device owned by "owner", with a small library and an install id. */
export async function setupSessions() {
  const fake = createFakeDatabase();
  await claimDeviceOwner(fake.database, "owner");
  const installId = await ensureInstallId(fake.database);
  const insert = fake.sqlite.prepare(
    `INSERT INTO exercise (id, user_id, title, primary_muscle, secondary_muscles, equipment,
       exercise_type, is_full_bodyweight, created_at) VALUES (?, NULL, ?, ?, ?, ?, ?, 0, 'now')`,
  );
  insert.run(SQUAT, "Squat", "quadriceps", '["glutes"]', "barbell", "weight_reps");
  insert.run(CURL, "Curl", "biceps", "[]", "dumbbell", "weight_reps");
  insert.run(PLANK, "Plank", "abdominals", "[]", "none", "duration");
  insert.run(PUSHUP, "Push-up", "chest", '["triceps"]', "none", "bodyweight_reps");
  insert.run(DIP, "Assisted dip", "triceps", '["chest"]', "machine", "bodyweight_assisted_reps");
  // SAFETY: the fake implements the database methods the store calls.
  const training = asTrainingDatabase(fake.database as never);
  const all = (table: string) => fake.sqlite.prepare(`SELECT * FROM ${table}`).all();
  const one = (table: string, id: string) =>
    fake.sqlite.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
  const sets = (sessionExerciseId: string) =>
    fake.sqlite
      .prepare("SELECT * FROM session_set WHERE session_exercise_id = ? ORDER BY position, id")
      .all(sessionExerciseId);
  const exercises = (sessionId: string) =>
    fake.sqlite
      .prepare("SELECT * FROM session_exercise WHERE session_id = ? ORDER BY position, id")
      .all(sessionId);
  return { ...fake, installId, training, all, one, sets, exercises };
}

export type Sessions = Awaited<ReturnType<typeof setupSessions>>;

/** A Workout of a squat (3 sets with a 5-8 rep, RPE 8 target) and a plank. */
export async function pushWorkout(s: Sessions, title: string | null = "Legs") {
  const workoutId = await createWorkout(s.training, { title });
  const [squat, plank] = await addExercises(s.training, workoutId, [SQUAT, PLANK]);
  await updateWorkoutExercise(s.training, squat ?? "", {
    sets: [
      { kind: "warmup", reps_min: 10, reps_max: 10, weight_kg: 40 },
      { kind: "working", reps_min: 5, reps_max: 8, weight_kg: 100, effort_min: 8, effort_max: 8 },
      { kind: "working", reps_min: 5, reps_max: 8, weight_kg: 100, effort_min: 8, effort_max: 8 },
    ],
  });
  return { workoutId, squat: squat ?? "", plank: plank ?? "" };
}
