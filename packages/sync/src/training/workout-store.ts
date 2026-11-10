import { v7 as uuidv7 } from "uuid";

import { workoutInput } from "@workspace/shared";
import { eq } from "drizzle-orm";

import { z } from "zod";

import { programSlot, workout, workoutExercise } from "./tables";

import {
  type TrainingDatabase,
  type DeletedWorkout,
  type Tx,
  write,
  ownerOf,
  marked,
  nowIso,
  assertRoom,
  liveWorkouts,
  slotsIn,
  changedFields,
  assertProgramExists,
} from "./store-common";
// ---- Workouts ----

const workoutFields = workoutInput.pick({ title: true, note: true }).partial();
export type WorkoutPatch = z.infer<typeof workoutFields>;

/** Creates an empty Workout, standalone or inside a Program of the Device owner. */
export async function createWorkout(
  database: TrainingDatabase,
  input: { program_id?: string | null; title?: string | null; note?: string | null } = {},
  expectedInstallId?: string,
): Promise<string> {
  const values = workoutInput.parse({ program_id: null, title: null, note: null, ...input });
  return write(database, expectedInstallId, async (tx) => {
    const userId = await ownerOf(tx);
    if (values.program_id !== null) await assertProgramExists(tx, values.program_id);
    assertRoom(await liveWorkouts(tx), 1, "liveWorkouts");
    const id = uuidv7();
    await tx.insert(workout).values({ id, user_id: userId, created_at: nowIso(), ...values });
    return id;
  });
}

/** Changes only the fields that differ from the stored Workout. Returns whether it wrote. */
export async function updateWorkout(
  database: TrainingDatabase,
  id: string,
  patch: WorkoutPatch,
  expectedInstallId?: string,
): Promise<boolean> {
  const fields = workoutFields.parse(patch);
  return await write(database, expectedInstallId, async (tx) => {
    const [current] = await tx.select().from(workout).where(eq(workout.id, id)).limit(1);
    if (!current) return false;
    const changes = changedFields(current, fields);
    if (Object.keys(changes).length === 0) return false;
    workoutInput.parse({
      program_id: current.program_id,
      title: current.title,
      note: current.note,
      ...changes,
    });
    await tx.update(workout).set(changes).where(eq(workout.id, id));
    return true;
  });
}

export async function deleteWorkoutIn(tx: Tx, id: string): Promise<DeletedWorkout | null> {
  const [current] = await tx.select().from(workout).where(eq(workout.id, id)).limit(1);
  if (!current) return null;
  const exercises = await tx
    .select()
    .from(workoutExercise)
    .where(eq(workoutExercise.workout_id, id));
  const slots = await tx.select().from(programSlot).where(eq(programSlot.workout_id, id));
  await tx.delete(workout).where(eq(workout.id, id));
  await tx.delete(workoutExercise).where(eq(workoutExercise.workout_id, id));
  await tx.delete(programSlot).where(eq(programSlot.workout_id, id));
  return { workout: current, exercises, slots };
}

/** Deletes a Workout with its exercises and the Slots it fills. Null if it is gone. */
export function deleteWorkout(
  database: TrainingDatabase,
  id: string,
  expectedInstallId?: string,
): Promise<DeletedWorkout | null> {
  return write(database, expectedInstallId, (tx) => deleteWorkoutIn(tx, id));
}

/** Undo of {@link deleteWorkout}. False if the Workout is back already. */
export function restoreWorkout(
  database: TrainingDatabase,
  deleted: DeletedWorkout,
  expectedInstallId?: string,
): Promise<boolean> {
  return write(database, expectedInstallId, async (tx) => {
    const [existing] = await tx
      .select({ id: workout.id })
      .from(workout)
      .where(eq(workout.id, deleted.workout.id))
      .limit(1);
    if (existing) return false;
    if (deleted.workout.program_id !== null) {
      await assertProgramExists(tx, deleted.workout.program_id);
    }
    assertRoom(await liveWorkouts(tx), 1, "liveWorkouts");
    await tx.insert(workout).values(marked(deleted.workout));
    if (deleted.exercises.length > 0)
      await tx.insert(workoutExercise).values(deleted.exercises.map(marked));
    if (deleted.slots.length > 0) {
      const programId = deleted.workout.program_id;
      if (programId !== null)
        assertRoom(await slotsIn(tx, programId), deleted.slots.length, "slotsPerProgram");
      await tx.insert(programSlot).values(deleted.slots.map(marked));
    }
    return true;
  });
}
