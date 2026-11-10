import type { DbExecutor } from "@workspace/db";
import { and, count, eq, inArray, isNull } from "drizzle-orm";

import { program, programSlot, workout, workoutExercise } from "../tables";

/**
 * Deleting is a soft delete with one timestamp, and so is everything it takes down with it.
 * Restoring clears only the rows carrying that same timestamp, so a row deleted on its own
 * earlier stays deleted.
 */

const workoutIdsOfProgram = (db: DbExecutor, programId: string) =>
  db.select({ id: workout.id }).from(workout).where(eq(workout.programId, programId));

/** Soft-deletes a Program with its Workouts, their exercises and its Slots. */
export async function deleteProgramCascade(db: DbExecutor, id: string, now: Date) {
  const mark = { deletedAt: now, updatedAt: now };
  await db
    .update(program)
    .set(mark)
    .where(and(eq(program.id, id), isNull(program.deletedAt)));
  await db
    .update(workoutExercise)
    .set(mark)
    .where(
      and(
        inArray(workoutExercise.workoutId, workoutIdsOfProgram(db, id)),
        isNull(workoutExercise.deletedAt),
      ),
    );
  await db
    .update(workout)
    .set(mark)
    .where(and(eq(workout.programId, id), isNull(workout.deletedAt)));
  await db
    .update(programSlot)
    .set(mark)
    .where(and(eq(programSlot.programId, id), isNull(programSlot.deletedAt)));
}

/** Soft-deletes a Workout with its exercises and the Slots it fills. */
export async function deleteWorkoutCascade(db: DbExecutor, id: string, now: Date) {
  const mark = { deletedAt: now, updatedAt: now };
  await db
    .update(workout)
    .set(mark)
    .where(and(eq(workout.id, id), isNull(workout.deletedAt)));
  await db
    .update(workoutExercise)
    .set(mark)
    .where(and(eq(workoutExercise.workoutId, id), isNull(workoutExercise.deletedAt)));
  await db
    .update(programSlot)
    .set(mark)
    .where(and(eq(programSlot.workoutId, id), isNull(programSlot.deletedAt)));
}

const live = { deletedAt: null } as const;

/** Workouts a Program restore would bring back. */
export async function countWorkoutsDeletedWith(db: DbExecutor, programId: string, at: Date) {
  const [row] = await db
    .select({ total: count() })
    .from(workout)
    .where(and(eq(workout.programId, programId), eq(workout.deletedAt, at)));
  return row?.total ?? 0;
}

/** Slots a Workout restore would bring back. */
export async function countSlotsDeletedWith(db: DbExecutor, workoutId: string, at: Date) {
  const [row] = await db
    .select({ total: count() })
    .from(programSlot)
    .where(and(eq(programSlot.workoutId, workoutId), eq(programSlot.deletedAt, at)));
  return row?.total ?? 0;
}

/** Brings back what `deleteProgramCascade` took down at `at`, then the Program itself. */
export async function restoreProgramCascade(db: DbExecutor, id: string, at: Date, now: Date) {
  const mark = { ...live, updatedAt: now };
  await db
    .update(workoutExercise)
    .set(mark)
    .where(
      and(
        inArray(workoutExercise.workoutId, workoutIdsOfProgram(db, id)),
        eq(workoutExercise.deletedAt, at),
      ),
    );
  await db
    .update(workout)
    .set(mark)
    .where(and(eq(workout.programId, id), eq(workout.deletedAt, at)));
  await db
    .update(programSlot)
    .set(mark)
    .where(and(eq(programSlot.programId, id), eq(programSlot.deletedAt, at)));
  await db
    .update(program)
    .set(mark)
    .where(and(eq(program.id, id), eq(program.deletedAt, at)));
}

/** Brings back what `deleteWorkoutCascade` took down at `at`, then the Workout itself. */
export async function restoreWorkoutCascade(db: DbExecutor, id: string, at: Date, now: Date) {
  const mark = { ...live, updatedAt: now };
  await db
    .update(workoutExercise)
    .set(mark)
    .where(and(eq(workoutExercise.workoutId, id), eq(workoutExercise.deletedAt, at)));
  await db
    .update(programSlot)
    .set(mark)
    .where(and(eq(programSlot.workoutId, id), eq(programSlot.deletedAt, at)));
  await db
    .update(workout)
    .set(mark)
    .where(and(eq(workout.id, id), eq(workout.deletedAt, at)));
}
