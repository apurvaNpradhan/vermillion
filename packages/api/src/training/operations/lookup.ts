import type { DbExecutor } from "@workspace/db";
import { EXERCISE_TYPES } from "@workspace/shared";
import { and, count, eq, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";

import { exercise } from "../../exercise/index";
import { program, programSlot, workout, workoutExercise } from "../tables";

export type ProgramRow = typeof program.$inferSelect;
export type WorkoutRow = typeof workout.$inferSelect;
export type WorkoutExerciseRow = typeof workoutExercise.$inferSelect;
export type ProgramSlotRow = typeof programSlot.$inferSelect;

/** Who a row belongs to, from one writer's point of view. A deleted row is still "own". */
export type Ownership<Row> =
  | { kind: "absent" }
  | { kind: "other-user" }
  | { kind: "own"; row: Row };

export function ownership<Row extends { userId: string }>(
  row: Row | undefined,
  userId: string,
): Ownership<Row> {
  if (!row) return { kind: "absent" };
  return row.userId === userId ? { kind: "own", row } : { kind: "other-user" };
}

/**
 * Takes the user's training lock for the rest of the transaction. Taken before any row is read,
 * so every write of one user sees the previous one's committed result: the live-count limits span
 * many rows and a create has no row to lock yet.
 */
export async function lockUserTraining(db: DbExecutor, userId: string) {
  await db.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`training:${userId}`}, 0))`);
}

export async function findProgram(db: DbExecutor, userId: string, id: string) {
  const [row] = await db.select().from(program).where(eq(program.id, id)).limit(1);
  return ownership(row, userId);
}

export async function findWorkout(db: DbExecutor, userId: string, id: string) {
  const [row] = await db.select().from(workout).where(eq(workout.id, id)).limit(1);
  return ownership(row, userId);
}

export async function findWorkoutExercise(db: DbExecutor, userId: string, id: string) {
  const [row] = await db.select().from(workoutExercise).where(eq(workoutExercise.id, id)).limit(1);
  return ownership(row, userId);
}

export async function findSlot(db: DbExecutor, userId: string, id: string) {
  const [row] = await db.select().from(programSlot).where(eq(programSlot.id, id)).limit(1);
  return ownership(row, userId);
}

/** A Program the writer owns and has not deleted, or undefined. */
export async function liveProgram(db: DbExecutor, userId: string, id: string) {
  const found = await findProgram(db, userId, id);
  return found.kind === "own" && found.row.deletedAt === null ? found.row : undefined;
}

/** A Workout the writer owns and has not deleted, or undefined. */
export async function liveWorkout(db: DbExecutor, userId: string, id: string) {
  const found = await findWorkout(db, userId, id);
  return found.kind === "own" && found.row.deletedAt === null ? found.row : undefined;
}

/** The type of an exercise the user may use (the catalog or their own), or undefined. */
export async function visibleExerciseType(db: DbExecutor, userId: string, id: string) {
  const [row] = await db
    .select({ userId: exercise.userId, exerciseType: exercise.exerciseType })
    .from(exercise)
    .where(eq(exercise.id, id))
    .limit(1);
  if (!row || (row.userId !== null && row.userId !== userId)) return undefined;
  // A CHECK on the column keeps it a known type.
  return z.enum(EXERCISE_TYPES).parse(row.exerciseType);
}

async function total(query: Promise<{ total: number }[]>) {
  const [row] = await query;
  return row?.total ?? 0;
}

/** Live Programs of the user, not counting `except`. */
export const countLivePrograms = (db: DbExecutor, userId: string, except: string) =>
  total(
    db
      .select({ total: count() })
      .from(program)
      .where(and(eq(program.userId, userId), isNull(program.deletedAt), ne(program.id, except))),
  );

/** Live Workouts of the user (standalone and owned), not counting `except`. */
export const countLiveWorkouts = (db: DbExecutor, userId: string, except: string) =>
  total(
    db
      .select({ total: count() })
      .from(workout)
      .where(and(eq(workout.userId, userId), isNull(workout.deletedAt), ne(workout.id, except))),
  );

/** Live exercises of one Workout, not counting `except`. */
export const countLiveWorkoutExercises = (db: DbExecutor, workoutId: string, except: string) =>
  total(
    db
      .select({ total: count() })
      .from(workoutExercise)
      .where(
        and(
          eq(workoutExercise.workoutId, workoutId),
          isNull(workoutExercise.deletedAt),
          ne(workoutExercise.id, except),
        ),
      ),
  );

/** Live Slots of one Program, not counting `except`. */
export const countLiveSlots = (db: DbExecutor, programId: string, except: string) =>
  total(
    db
      .select({ total: count() })
      .from(programSlot)
      .where(
        and(
          eq(programSlot.programId, programId),
          isNull(programSlot.deletedAt),
          ne(programSlot.id, except),
        ),
      ),
  );
