import { v7 as uuidv7 } from "uuid";

import {
  defaultPlannedSets,
  defaultRestSeconds,
  plannedSetsSchema,
  planSupersetAfterMove,
  planSupersetAfterRemoval,
  planLeaveSuperset,
  planSupersetRepair,
  planSupersetWithNext,
  workoutExerciseInput,
} from "@workspace/shared";
import { eq } from "drizzle-orm";

import { z } from "zod";

import { exercise } from "../exercise";

import { keyAfterLast, keyForMove, keysAfterLast } from "./position";
import { workout, workoutExercise } from "./tables";

import {
  type TrainingDatabase,
  type WorkoutExerciseRow,
  type TrainingPreferences,
  DEFAULT_PREFERENCES,
  type Tx,
  write,
  ownerOf,
  marked,
  nowIso,
  assertRoom,
  exercisesIn,
  changedFields,
  exerciseListOf,
  supersetRowsOf,
  applySupersetChanges,
  rebalanceExercises,
} from "./store-common";
// ---- Workout exercises ----

async function exerciseTypeOf(tx: Tx, exerciseId: string) {
  const [row] = await tx
    .select({
      exercise_type: exercise.exercise_type,
      equipment: exercise.equipment,
      secondary_muscles: exercise.secondary_muscles,
    })
    .from(exercise)
    .where(eq(exercise.id, exerciseId))
    .limit(1);
  if (!row) throw new Error("The exercise is not in the library");
  return row;
}

function defaultsFor(
  row: Awaited<ReturnType<typeof exerciseTypeOf>>,
  preferences: TrainingPreferences,
) {
  return {
    sets: defaultPlannedSets(row.exercise_type),
    rest_seconds: defaultRestSeconds(row.exercise_type, preferences.defaultRestSeconds, {
      equipment: row.equipment,
      secondaryMuscles: row.secondary_muscles,
    }),
  };
}

/**
 * Appends exercises to a Workout in the given order, each with the defaults of its type (3 working
 * sets, rest from the preference). Returns the new Workout exercise ids.
 */
export function addExercises(
  database: TrainingDatabase,
  workoutId: string,
  exerciseIds: readonly string[],
  preferences: TrainingPreferences = DEFAULT_PREFERENCES,
  expectedInstallId?: string,
): Promise<string[]> {
  return write(database, expectedInstallId, async (tx) => {
    const userId = await ownerOf(tx);
    const [parent] = await tx
      .select({ id: workout.id })
      .from(workout)
      .where(eq(workout.id, workoutId))
      .limit(1);
    if (!parent) throw new Error("The workout is gone");
    assertRoom(await exercisesIn(tx, workoutId), exerciseIds.length, "exercisesPerWorkout");
    const items = await rebalanceExercises(tx, await exerciseListOf(tx, workoutId));
    const keys = keysAfterLast(items, exerciseIds.length);
    const ids: string[] = [];
    for (const [index, exerciseId] of exerciseIds.entries()) {
      const defaults = defaultsFor(await exerciseTypeOf(tx, exerciseId), preferences);
      const id = uuidv7();
      await tx.insert(workoutExercise).values({
        id,
        user_id: userId,
        workout_id: workoutId,
        exercise_id: exerciseId,
        position: keys[index] ?? keyAfterLast(items),
        note: null,
        superset_group: null,
        created_at: nowIso(),
        ...defaults,
      });
      ids.push(id);
    }
    return ids;
  });
}

const exerciseFields = workoutExerciseInput
  .pick({ rest_seconds: true, note: true, superset_group: true, sets: true })
  .partial();
export type WorkoutExercisePatch = z.infer<typeof exerciseFields>;

/**
 * Changes only the fields that differ from the stored Workout exercise. The sets are checked
 * against the exercise's type and written as a unit. Returns whether it wrote.
 */
export async function updateWorkoutExercise(
  database: TrainingDatabase,
  id: string,
  patch: WorkoutExercisePatch,
  expectedInstallId?: string,
): Promise<boolean> {
  const fields = exerciseFields.parse(patch);
  return await write(database, expectedInstallId, async (tx) => {
    const [current] = await tx
      .select()
      .from(workoutExercise)
      .where(eq(workoutExercise.id, id))
      .limit(1);
    if (!current) return false;
    if (fields.sets !== undefined) {
      const type = (await exerciseTypeOf(tx, current.exercise_id)).exercise_type;
      plannedSetsSchema(type).parse(fields.sets);
    }
    const changes = changedFields(current, fields);
    if (Object.keys(changes).length === 0) return false;
    workoutExerciseInput.parse({
      workout_id: current.workout_id,
      exercise_id: current.exercise_id,
      position: current.position,
      rest_seconds: current.rest_seconds,
      note: current.note,
      superset_group: current.superset_group,
      sets: current.sets,
      ...changes,
    });
    await tx.update(workoutExercise).set(changes).where(eq(workoutExercise.id, id));
    if ("rest_seconds" in changes || "superset_group" in changes) {
      // A group of one is no group, and only the last member of a group holds its rest.
      const rows = await supersetRowsOf(tx, current.workout_id);
      await applySupersetChanges(tx, planSupersetRepair(rows));
    }
    return true;
  });
}

/** Moves an exercise to just before `beforeId` (`null` = the end). Rewrites one row. */
export function moveWorkoutExercise(
  database: TrainingDatabase,
  id: string,
  beforeId: string | null,
  expectedInstallId?: string,
): Promise<boolean> {
  return write(database, expectedInstallId, async (tx) => {
    const [current] = await tx
      .select({ workout_id: workoutExercise.workout_id })
      .from(workoutExercise)
      .where(eq(workoutExercise.id, id))
      .limit(1);
    if (!current) return false;
    const items = await rebalanceExercises(tx, await exerciseListOf(tx, current.workout_id));
    if (beforeId === id) return false;
    const position = keyForMove(items, id, beforeId);
    const rowsBefore = await supersetRowsOf(tx, current.workout_id);
    await tx.update(workoutExercise).set({ position }).where(eq(workoutExercise.id, id));
    // A member dragged out of its run leaves the group; a row dropped inside one joins it.
    const rowsAfter = await supersetRowsOf(tx, current.workout_id);
    await applySupersetChanges(tx, planSupersetAfterMove(rowsBefore, rowsAfter, id));
    return true;
  });
}

/**
 * Swaps the exercise of a row. The same exercise type keeps its sets, rest and note; another
 * type gets that type's default sets and rest and keeps the note.
 */
export function replaceExercise(
  database: TrainingDatabase,
  id: string,
  exerciseId: string,
  preferences: TrainingPreferences = DEFAULT_PREFERENCES,
  expectedInstallId?: string,
): Promise<boolean> {
  return write(database, expectedInstallId, async (tx) => {
    const [current] = await tx
      .select()
      .from(workoutExercise)
      .where(eq(workoutExercise.id, id))
      .limit(1);
    if (!current || current.exercise_id === exerciseId) return false;
    const before = await exerciseTypeOf(tx, current.exercise_id);
    const after = await exerciseTypeOf(tx, exerciseId);
    const kept = before.exercise_type === after.exercise_type;
    await tx
      .update(workoutExercise)
      .set({ exercise_id: exerciseId, ...(kept ? {} : defaultsFor(after, preferences)) })
      .where(eq(workoutExercise.id, id));
    return true;
  });
}

/** Removes an exercise from its Workout. */
export function removeWorkoutExercise(
  database: TrainingDatabase,
  id: string,
  expectedInstallId?: string,
): Promise<boolean> {
  return write(database, expectedInstallId, async (tx) => {
    const [current] = await tx
      .select({ workout_id: workoutExercise.workout_id })
      .from(workoutExercise)
      .where(eq(workoutExercise.id, id))
      .limit(1);
    if (!current) return false;
    const rows = await supersetRowsOf(tx, current.workout_id);
    await tx.delete(workoutExercise).where(eq(workoutExercise.id, id));
    // A group left with one member is cleared; the group's rest passes to its new last member.
    await applySupersetChanges(tx, planSupersetAfterRemoval(rows, id));
    return true;
  });
}

/**
 * "Superset with next": the exercise and the one after it share a group, joining the next one's
 * group when it has one. The group's rest stays on its last member and the others' rest is null.
 * Returns whether it wrote.
 */
export function supersetWithNext(
  database: TrainingDatabase,
  id: string,
  expectedInstallId?: string,
): Promise<boolean> {
  return write(database, expectedInstallId, async (tx) => {
    const [current] = await tx
      .select({ workout_id: workoutExercise.workout_id })
      .from(workoutExercise)
      .where(eq(workoutExercise.id, id))
      .limit(1);
    if (!current) return false;
    const rows = await supersetRowsOf(tx, current.workout_id);
    const changes = planSupersetWithNext(rows, id, uuidv7());
    await applySupersetChanges(tx, changes);
    return changes.length > 0;
  });
}

/**
 * "Remove from superset": the exercise leaves its group, which is cleared when only one member is
 * left. Whoever ends up alone, or last, keeps the group's rest. Returns whether it wrote.
 */
export function removeFromSuperset(
  database: TrainingDatabase,
  id: string,
  expectedInstallId?: string,
): Promise<boolean> {
  return write(database, expectedInstallId, async (tx) => {
    const [current] = await tx
      .select({ workout_id: workoutExercise.workout_id })
      .from(workoutExercise)
      .where(eq(workoutExercise.id, id))
      .limit(1);
    if (!current) return false;
    const rows = await supersetRowsOf(tx, current.workout_id);
    const changes = planLeaveSuperset(rows, id);
    await applySupersetChanges(tx, changes);
    return changes.length > 0;
  });
}

/** What {@link restoreWorkoutExercise} puts back: the row a remove took out. */
export type RemovedWorkoutExercise = Pick<
  WorkoutExerciseRow,
  | "id"
  | "workout_id"
  | "exercise_id"
  | "position"
  | "rest_seconds"
  | "note"
  | "superset_group"
  | "sets"
>;

/** Undo of {@link removeWorkoutExercise}: the same id and position. False if it is back already. */
export function restoreWorkoutExercise(
  database: TrainingDatabase,
  removed: RemovedWorkoutExercise,
  expectedInstallId?: string,
): Promise<boolean> {
  return write(database, expectedInstallId, async (tx) => {
    const userId = await ownerOf(tx);
    const [existing] = await tx
      .select({ id: workoutExercise.id })
      .from(workoutExercise)
      .where(eq(workoutExercise.id, removed.id))
      .limit(1);
    if (existing) return false;
    const [parent] = await tx
      .select({ id: workout.id })
      .from(workout)
      .where(eq(workout.id, removed.workout_id))
      .limit(1);
    if (!parent) throw new Error("The workout is gone");
    assertRoom(await exercisesIn(tx, removed.workout_id), 1, "exercisesPerWorkout");
    await tx
      .insert(workoutExercise)
      .values(marked({ ...removed, user_id: userId, created_at: nowIso() }));
    // Its group may be gone meanwhile: clear what is left of one.
    await applySupersetChanges(
      tx,
      planSupersetRepair(await supersetRowsOf(tx, removed.workout_id)),
    );
    return true;
  });
}
