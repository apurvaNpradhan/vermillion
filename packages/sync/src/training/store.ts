import type { AbstractPowerSyncDatabase } from "@powersync/common";
import { wrapPowerSyncWithDrizzle } from "@powersync/drizzle-driver";
import {
  DEFAULT_REST_SECONDS,
  defaultPlannedSets,
  defaultRestSeconds,
  plannedSetsSchema,
  planSupersetAfterMove,
  planSupersetAfterRemoval,
  planLeaveSuperset,
  planSupersetRepair,
  planSupersetWithNext,
  programInput,
  TRAINING_LIMITS,
  workoutExerciseInput,
  workoutInput,
  type ProgramInput,
  type SupersetChange,
  type SupersetItem,
} from "@workspace/shared";
import { and, asc, count, eq, inArray, ne } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";

import { exercise } from "../exercise";
import { DEVICE_OWNER_ID } from "../platform/device-owner";
import { drizzleSchema } from "../platform/schema";
import { deviceOwner, installMeta } from "../platform/tables";
import {
  keyAfterLast,
  keyForMove,
  keysAfterLast,
  needsRebalance,
  rebalanced,
  sortByPosition,
  type Positioned,
} from "./position";
import { program, programCover, programSlot, workout, workoutExercise } from "./tables";

export type TrainingDatabase = AbstractPowerSyncDatabase;

export type ProgramRow = typeof program.$inferSelect;
export type WorkoutRow = typeof workout.$inferSelect;
export type WorkoutExerciseRow = typeof workoutExercise.$inferSelect;
export type ProgramSlotRow = typeof programSlot.$inferSelect;

/** What a delete removed, so Undo can put it back with the same ids (the server restores them). */
export type DeletedWorkout = {
  workout: WorkoutRow;
  exercises: WorkoutExerciseRow[];
  slots: ProgramSlotRow[];
};
export type DeletedProgram = {
  program: ProgramRow;
  workouts: WorkoutRow[];
  exercises: WorkoutExerciseRow[];
  slots: ProgramSlotRow[];
};

/** A write would pass one of the {@link TRAINING_LIMITS}. */
export class TrainingLimitError extends Error {
  readonly limit: keyof typeof TRAINING_LIMITS;
  constructor(limit: keyof typeof TRAINING_LIMITS) {
    super(`Training limit reached: ${limit}`);
    this.name = "TrainingLimitError";
    this.limit = limit;
  }
}

/** Columns of the training tables the server accepts in an upload; the rest are local only. */
export const trainingUploadColumns = {
  program: new Set(["title", "description", "planned_weeks", "restore"]),
  workout: new Set(["program_id", "title", "note", "restore"]),
  workout_exercise: new Set([
    "workout_id",
    "exercise_id",
    "position",
    "rest_seconds",
    "note",
    "superset_group",
    "sets",
    "restore",
  ]),
  program_slot: new Set(["program_id", "workout_id", "position", "restore"]),
} as const satisfies Record<string, ReadonlySet<string>>;

/** User-set values a new exercise is created with. */
export type TrainingPreferences = { defaultRestSeconds: number };
const DEFAULT_PREFERENCES: TrainingPreferences = { defaultRestSeconds: DEFAULT_REST_SECONDS };

const clients = new WeakMap<TrainingDatabase, ReturnType<typeof open>>();

function open(database: TrainingDatabase) {
  return wrapPowerSyncWithDrizzle(database, { schema: drizzleSchema });
}

function local(database: TrainingDatabase) {
  const existing = clients.get(database);
  if (existing) return existing;
  const created = open(database);
  clients.set(database, created);
  return created;
}

type Tx = Parameters<Parameters<ReturnType<typeof open>["transaction"]>[0]>[0];

/** Runs a write inside the SQLite write transaction, after the write-scope check (ADR 0021). */
function write<T>(
  database: TrainingDatabase,
  expectedInstallId: string | undefined,
  run: (tx: Tx) => Promise<T>,
): Promise<T> {
  return local(database).transaction(async (tx) => {
    if (expectedInstallId !== undefined) {
      const [install] = await tx
        .select({ id: installMeta.id })
        .from(installMeta)
        .where(eq(installMeta.install_id, expectedInstallId))
        .limit(1);
      if (!install) throw new Error("The device account changed; reopen the screen");
    }
    return run(tx);
  });
}

async function ownerOf(tx: Tx): Promise<string> {
  const [owner] = await tx
    .select({ userId: deviceOwner.user_id })
    .from(deviceOwner)
    .where(eq(deviceOwner.id, DEVICE_OWNER_ID))
    .limit(1);
  if (!owner) throw new Error("No Device owner: sign in first");
  return owner.userId;
}

/** A row put back by Undo carries the explicit restore marker; the server refuses a plain PUT. */
function marked<Row extends object>(row: Row) {
  return { ...row, restore: 1 };
}

const nowIso = () => new Date().toISOString();

function assertRoom(live: number, adding: number, limit: keyof typeof TRAINING_LIMITS) {
  if (live + adding > TRAINING_LIMITS[limit]) throw new TrainingLimitError(limit);
}

async function totalOf(query: Promise<{ total: number }[]>) {
  const [row] = await query;
  return row?.total ?? 0;
}

const liveWorkouts = (tx: Tx) => totalOf(tx.select({ total: count() }).from(workout));
const livePrograms = (tx: Tx) => totalOf(tx.select({ total: count() }).from(program));
const exercisesIn = (tx: Tx, workoutId: string) =>
  totalOf(
    tx
      .select({ total: count() })
      .from(workoutExercise)
      .where(eq(workoutExercise.workout_id, workoutId)),
  );
const slotsIn = (tx: Tx, programId: string) =>
  totalOf(
    tx.select({ total: count() }).from(programSlot).where(eq(programSlot.program_id, programId)),
  );

/** The fields of the patch that differ from the stored row: a form's dirty fields. */
function changedFields<Row extends object>(row: Row, patch: Partial<Row>): Partial<Row> {
  const stored = new Map(Object.entries(row));
  const changes: Partial<Row> = {};
  for (const [key, next] of Object.entries(patch)) {
    if (next !== undefined && JSON.stringify(next) !== JSON.stringify(stored.get(key))) {
      Object.assign(changes, { [key]: next });
    }
  }
  return changes;
}

// ---- Position lists ----

const exerciseListOf = (tx: Tx, workoutId: string) =>
  tx
    .select({ id: workoutExercise.id, position: workoutExercise.position })
    .from(workoutExercise)
    .where(eq(workoutExercise.workout_id, workoutId))
    .orderBy(asc(workoutExercise.position), asc(workoutExercise.id));

const slotListOf = (tx: Tx, programId: string) =>
  tx
    .select({ id: programSlot.id, position: programSlot.position })
    .from(programSlot)
    .where(eq(programSlot.program_id, programId))
    .orderBy(asc(programSlot.position), asc(programSlot.id));

/** The superset-relevant fields of a Workout's exercises, in order. */
const supersetRowsOf = (tx: Tx, workoutId: string): Promise<SupersetItem[]> =>
  tx
    .select({
      id: workoutExercise.id,
      superset_group: workoutExercise.superset_group,
      rest_seconds: workoutExercise.rest_seconds,
    })
    .from(workoutExercise)
    .where(eq(workoutExercise.workout_id, workoutId))
    .orderBy(asc(workoutExercise.position), asc(workoutExercise.id));

async function applySupersetChanges(tx: Tx, changes: readonly SupersetChange[]) {
  for (const { id, ...fields } of changes) {
    await tx.update(workoutExercise).set(fields).where(eq(workoutExercise.id, id));
  }
}

/** Renumbers a list whose keys grew long or collided, in the same transaction as the move. */
async function rebalanceExercises(tx: Tx, items: Positioned[]): Promise<Positioned[]> {
  if (!needsRebalance(items)) return items;
  const changes = rebalanced(items);
  for (const change of changes) {
    await tx
      .update(workoutExercise)
      .set({ position: change.position })
      .where(eq(workoutExercise.id, change.id));
  }
  const byId = new Map(changes.map((change) => [change.id, change.position]));
  return sortByPosition(
    items.map((item) => ({ ...item, position: byId.get(item.id) ?? item.position })),
  );
}

async function rebalanceSlots(tx: Tx, items: Positioned[]): Promise<Positioned[]> {
  if (!needsRebalance(items)) return items;
  const changes = rebalanced(items);
  for (const change of changes) {
    await tx
      .update(programSlot)
      .set({ position: change.position })
      .where(eq(programSlot.id, change.id));
  }
  const byId = new Map(changes.map((change) => [change.id, change.position]));
  return sortByPosition(
    items.map((item) => ({ ...item, position: byId.get(item.id) ?? item.position })),
  );
}

// ---- Programs ----

export type ProgramPatch = Partial<ProgramInput>;

/** Creates a Program for the Device owner; it uploads as a PUT. */
export async function createProgram(
  database: TrainingDatabase,
  input: ProgramInput,
  expectedInstallId?: string,
): Promise<string> {
  const values = programInput.parse(input);
  return await write(database, expectedInstallId, async (tx) => {
    const userId = await ownerOf(tx);
    assertRoom(await livePrograms(tx), 1, "livePrograms");
    const id = uuidv7();
    await tx
      .insert(program)
      .values({ id, user_id: userId, cover_key: null, created_at: nowIso(), ...values });
    return id;
  });
}

/** Changes only the fields that differ from the stored Program. Returns whether it wrote. */
export async function updateProgram(
  database: TrainingDatabase,
  id: string,
  patch: ProgramPatch,
  expectedInstallId?: string,
): Promise<boolean> {
  const fields = programInput.partial().parse(patch);
  return await write(database, expectedInstallId, async (tx) => {
    const [current] = await tx.select().from(program).where(eq(program.id, id)).limit(1);
    if (!current) return false;
    const changes = changedFields(current, fields);
    if (Object.keys(changes).length === 0) return false;
    programInput.parse({
      title: current.title,
      description: current.description,
      planned_weeks: current.planned_weeks,
      ...changes,
    });
    await tx.update(program).set(changes).where(eq(program.id, id));
    return true;
  });
}

/** Deletes a Program with its Workouts, their exercises and its Slots. Null if it is gone. */
export function deleteProgram(
  database: TrainingDatabase,
  id: string,
  expectedInstallId?: string,
): Promise<DeletedProgram | null> {
  return write(database, expectedInstallId, async (tx) => {
    const [current] = await tx.select().from(program).where(eq(program.id, id)).limit(1);
    if (!current) return null;
    const workouts = await tx.select().from(workout).where(eq(workout.program_id, id));
    const ids = workouts.map((row) => row.id);
    const exercises =
      ids.length > 0
        ? await tx.select().from(workoutExercise).where(inArray(workoutExercise.workout_id, ids))
        : [];
    const slots = await tx.select().from(programSlot).where(eq(programSlot.program_id, id));
    // Parent first: the server soft-deletes the whole plan under the one timestamp.
    await tx.delete(program).where(eq(program.id, id));
    await tx.delete(programSlot).where(eq(programSlot.program_id, id));
    if (ids.length > 0) {
      await tx.delete(workoutExercise).where(inArray(workoutExercise.workout_id, ids));
    }
    await tx.delete(workout).where(eq(workout.program_id, id));
    return { program: current, workouts, exercises, slots };
  });
}

/** Undo of {@link deleteProgram}: puts the rows back with their ids. False if already there. */
export function restoreProgram(
  database: TrainingDatabase,
  deleted: DeletedProgram,
  expectedInstallId?: string,
): Promise<boolean> {
  return write(database, expectedInstallId, async (tx) => {
    const [existing] = await tx
      .select({ id: program.id })
      .from(program)
      .where(eq(program.id, deleted.program.id))
      .limit(1);
    if (existing) return false;
    assertRoom(await livePrograms(tx), 1, "livePrograms");
    await tx.insert(program).values(marked(deleted.program));
    if (deleted.workouts.length > 0) await tx.insert(workout).values(deleted.workouts.map(marked));
    if (deleted.exercises.length > 0)
      await tx.insert(workoutExercise).values(deleted.exercises.map(marked));
    if (deleted.slots.length > 0) await tx.insert(programSlot).values(deleted.slots.map(marked));
    return true;
  });
}

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

async function assertProgramExists(tx: Tx, programId: string) {
  const [found] = await tx
    .select({ id: program.id })
    .from(program)
    .where(eq(program.id, programId))
    .limit(1);
  if (!found) throw new Error("The program is gone");
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

async function deleteWorkoutIn(tx: Tx, id: string): Promise<DeletedWorkout | null> {
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

// ---- Copies ----

type CopyContext = { userId: string; created: string };

/** New ids for a Workout and its exercises; Superset groups get new ids too. */
async function copyWorkoutRows(
  tx: Tx,
  context: CopyContext,
  source: WorkoutRow,
  programId: string | null,
): Promise<{ id: string }> {
  const id = uuidv7();
  await tx.insert(workout).values({
    id,
    user_id: context.userId,
    program_id: programId,
    title: source.title,
    note: source.note,
    created_at: context.created,
  });
  const exercises = await tx
    .select()
    .from(workoutExercise)
    .where(eq(workoutExercise.workout_id, source.id));
  const groups = new Map<string, string>();
  const groupOf = (group: string | null) => {
    if (group === null) return null;
    const existing = groups.get(group);
    if (existing) return existing;
    const created = uuidv7();
    groups.set(group, created);
    return created;
  };
  const rows = sortByPosition(exercises).map((row) => ({
    ...row,
    id: uuidv7(),
    workout_id: id,
    superset_group: groupOf(row.superset_group),
    created_at: context.created,
    restore: null,
  }));
  if (rows.length > 0) await tx.insert(workoutExercise).values(rows);
  return { id };
}

/**
 * Copies a Workout with new ids for it and its exercises, standalone (`null`) or into a Program.
 * Copying is the only way a Workout changes owner. Returns the new Workout id.
 */
export function copyWorkout(
  database: TrainingDatabase,
  id: string,
  targetProgramId: string | null,
  expectedInstallId?: string,
): Promise<string> {
  return write(database, expectedInstallId, async (tx) => {
    const userId = await ownerOf(tx);
    const [source] = await tx.select().from(workout).where(eq(workout.id, id)).limit(1);
    if (!source) throw new Error("The workout is gone");
    if (targetProgramId !== null) await assertProgramExists(tx, targetProgramId);
    assertRoom(await liveWorkouts(tx), 1, "liveWorkouts");
    return (await copyWorkoutRows(tx, { userId, created: nowIso() }, source, targetProgramId)).id;
  });
}

/**
 * Copies a Program with its Workouts and Rotation under new ids. Returns the new Program id.
 */
export function copyProgram(
  database: TrainingDatabase,
  id: string,
  expectedInstallId?: string,
): Promise<string> {
  return write(database, expectedInstallId, async (tx) => {
    const userId = await ownerOf(tx);
    const [source] = await tx.select().from(program).where(eq(program.id, id)).limit(1);
    if (!source) throw new Error("The program is gone");
    const workouts = await tx.select().from(workout).where(eq(workout.program_id, id));
    assertRoom(await livePrograms(tx), 1, "livePrograms");
    assertRoom(await liveWorkouts(tx), workouts.length, "liveWorkouts");
    const context = { userId, created: nowIso() };
    const newId = uuidv7();
    await tx
      .insert(program)
      .values({ ...source, id: newId, created_at: context.created, restore: null });
    const copies = new Map<string, string>();
    for (const row of workouts) {
      copies.set(row.id, (await copyWorkoutRows(tx, context, row, newId)).id);
    }
    const slots = await tx.select().from(programSlot).where(eq(programSlot.program_id, id));
    const rows = sortByPosition(slots).map((slot) => ({
      ...slot,
      id: uuidv7(),
      program_id: newId,
      workout_id: slot.workout_id === null ? null : (copies.get(slot.workout_id) ?? null),
      created_at: context.created,
      restore: null,
    }));
    if (rows.length > 0) await tx.insert(programSlot).values(rows);
    return newId;
  });
}

// ---- Slots ----

async function assertWorkoutInProgram(tx: Tx, programId: string, workoutId: string | null) {
  if (workoutId === null) return;
  const [found] = await tx
    .select({ id: workout.id })
    .from(workout)
    .where(and(eq(workout.id, workoutId), eq(workout.program_id, programId)))
    .limit(1);
  if (!found) throw new Error("The workout does not belong to this program");
}

/** Appends a Slot to the Rotation: one of the Program's Workouts, or Rest (`null`). */
export function addSlot(
  database: TrainingDatabase,
  programId: string,
  workoutId: string | null,
  expectedInstallId?: string,
): Promise<string> {
  return write(database, expectedInstallId, async (tx) => {
    const userId = await ownerOf(tx);
    await assertProgramExists(tx, programId);
    await assertWorkoutInProgram(tx, programId, workoutId);
    assertRoom(await slotsIn(tx, programId), 1, "slotsPerProgram");
    const items = await rebalanceSlots(tx, await slotListOf(tx, programId));
    const id = uuidv7();
    await tx.insert(programSlot).values({
      id,
      user_id: userId,
      program_id: programId,
      workout_id: workoutId,
      position: keyAfterLast(items),
      created_at: nowIso(),
    });
    return id;
  });
}

/** Changes which Workout (or Rest) a Slot holds. Returns whether it wrote. */
export function updateSlot(
  database: TrainingDatabase,
  id: string,
  workoutId: string | null,
  expectedInstallId?: string,
): Promise<boolean> {
  return write(database, expectedInstallId, async (tx) => {
    const [current] = await tx.select().from(programSlot).where(eq(programSlot.id, id)).limit(1);
    if (!current || current.workout_id === workoutId) return false;
    await assertWorkoutInProgram(tx, current.program_id, workoutId);
    await tx.update(programSlot).set({ workout_id: workoutId }).where(eq(programSlot.id, id));
    return true;
  });
}

/** Moves a Slot to just before `beforeId` (`null` = the end). Rewrites one row. */
export function moveSlot(
  database: TrainingDatabase,
  id: string,
  beforeId: string | null,
  expectedInstallId?: string,
): Promise<boolean> {
  return write(database, expectedInstallId, async (tx) => {
    const [current] = await tx
      .select({ program_id: programSlot.program_id })
      .from(programSlot)
      .where(eq(programSlot.id, id))
      .limit(1);
    if (!current || beforeId === id) return false;
    const items = await rebalanceSlots(tx, await slotListOf(tx, current.program_id));
    const position = keyForMove(items, id, beforeId);
    await tx.update(programSlot).set({ position }).where(eq(programSlot.id, id));
    return true;
  });
}

/** Removes a Slot from the Rotation. */
export function removeSlot(
  database: TrainingDatabase,
  id: string,
  expectedInstallId?: string,
): Promise<boolean> {
  return write(database, expectedInstallId, async (tx) => {
    const removed = await tx
      .delete(programSlot)
      .where(eq(programSlot.id, id))
      .returning({ id: programSlot.id });
    return removed.length > 0;
  });
}

/** What {@link removeFromRotation} took out: a Slot, or the Workout with the Slot it filled. */
export type RemovedFromRotation =
  | { kind: "slot"; slot: ProgramSlotRow }
  | { kind: "workout"; deleted: DeletedWorkout };

/**
 * Removes a Slot from the Rotation. The Workout it held goes too, but only when no other Slot
 * uses it (a Workout with no Slot would be unreachable). Null if the Slot is gone.
 */
export function removeFromRotation(
  database: TrainingDatabase,
  slotId: string,
  expectedInstallId?: string,
): Promise<RemovedFromRotation | null> {
  return write(database, expectedInstallId, async (tx) => {
    const [slot] = await tx.select().from(programSlot).where(eq(programSlot.id, slotId)).limit(1);
    if (!slot) return null;
    if (slot.workout_id !== null) {
      const others = await totalOf(
        tx
          .select({ total: count() })
          .from(programSlot)
          .where(and(eq(programSlot.workout_id, slot.workout_id), ne(programSlot.id, slotId))),
      );
      if (others === 0) {
        const deleted = await deleteWorkoutIn(tx, slot.workout_id);
        if (deleted) return { kind: "workout", deleted };
      }
    }
    await tx.delete(programSlot).where(eq(programSlot.id, slotId));
    return { kind: "slot", slot };
  });
}

/** Undo of {@link removeFromRotation}. False if it is back already. */
export function restoreFromRotation(
  database: TrainingDatabase,
  removed: RemovedFromRotation,
  expectedInstallId?: string,
): Promise<boolean> {
  if (removed.kind === "workout")
    return restoreWorkout(database, removed.deleted, expectedInstallId);
  return write(database, expectedInstallId, async (tx) => {
    const { slot } = removed;
    const [existing] = await tx
      .select({ id: programSlot.id })
      .from(programSlot)
      .where(eq(programSlot.id, slot.id))
      .limit(1);
    if (existing) return false;
    await assertProgramExists(tx, slot.program_id);
    await assertWorkoutInProgram(tx, slot.program_id, slot.workout_id);
    assertRoom(await slotsIn(tx, slot.program_id), 1, "slotsPerProgram");
    await tx.insert(programSlot).values(marked(slot));
    return true;
  });
}

/**
 * Copies a Workout into a Program and appends a Slot for the copy, in one step. The source is a
 * standalone Workout or one of this Program's. Returns the new Workout and Slot ids.
 */
export function copyWorkoutIntoProgram(
  database: TrainingDatabase,
  workoutId: string,
  programId: string,
  expectedInstallId?: string,
): Promise<{ workoutId: string; slotId: string }> {
  return write(database, expectedInstallId, async (tx) => {
    const userId = await ownerOf(tx);
    const [source] = await tx.select().from(workout).where(eq(workout.id, workoutId)).limit(1);
    if (!source) throw new Error("The workout is gone");
    if (source.program_id !== null && source.program_id !== programId) {
      throw new Error("The workout belongs to another program");
    }
    await assertProgramExists(tx, programId);
    assertRoom(await liveWorkouts(tx), 1, "liveWorkouts");
    assertRoom(await slotsIn(tx, programId), 1, "slotsPerProgram");
    const context = { userId, created: nowIso() };
    const copy = await copyWorkoutRows(tx, context, source, programId);
    const items = await rebalanceSlots(tx, await slotListOf(tx, programId));
    const slotId = uuidv7();
    await tx.insert(programSlot).values({
      id: slotId,
      user_id: userId,
      program_id: programId,
      workout_id: copy.id,
      position: keyAfterLast(items),
      created_at: context.created,
    });
    return { workoutId: copy.id, slotId };
  });
}

/**
 * Gives a Slot its own copy of its Workout (so editing it no longer changes the other Slots that
 * share it). The original stays for those Slots; when none is left it is deleted with the swap.
 * Null for a Rest or missing Slot.
 */
export function duplicateSlotWorkout(
  database: TrainingDatabase,
  slotId: string,
  expectedInstallId?: string,
): Promise<{ workoutId: string; originalKept: boolean } | null> {
  return write(database, expectedInstallId, async (tx) => {
    const userId = await ownerOf(tx);
    const [slot] = await tx.select().from(programSlot).where(eq(programSlot.id, slotId)).limit(1);
    if (!slot || slot.workout_id === null) return null;
    const [source] = await tx
      .select()
      .from(workout)
      .where(eq(workout.id, slot.workout_id))
      .limit(1);
    if (!source) return null;
    const others = await totalOf(
      tx
        .select({ total: count() })
        .from(programSlot)
        .where(and(eq(programSlot.workout_id, source.id), ne(programSlot.id, slotId))),
    );
    // A copy replaces the original when nothing else uses it, so the count does not grow.
    assertRoom(await liveWorkouts(tx), others === 0 ? 0 : 1, "liveWorkouts");
    const copy = await copyWorkoutRows(tx, { userId, created: nowIso() }, source, slot.program_id);
    await tx.update(programSlot).set({ workout_id: copy.id }).where(eq(programSlot.id, slotId));
    if (others === 0) await deleteWorkoutIn(tx, source.id);
    return { workoutId: copy.id, originalKept: others > 0 };
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

// ---- Program covers (local only) ----

/** The cover photo of a Program on this device: where the file is. */
export type ProgramCoverRow = typeof programCover.$inferSelect;

/**
 * Records `uri` as the Program's cover photo, replacing an earlier one. The table is local only,
 * so this never uploads. Returns the uri it replaced (the same one when the file was overwritten).
 */
export function setProgramCover(
  database: TrainingDatabase,
  programId: string,
  uri: string,
  expectedInstallId?: string,
): Promise<string | null> {
  return write(database, expectedInstallId, async (tx) => {
    const [existing] = await tx
      .select({ uri: programCover.uri })
      .from(programCover)
      .where(eq(programCover.id, programId))
      .limit(1);
    const row = { program_id: programId, uri, updated_at: nowIso() };
    if (existing) await tx.update(programCover).set(row).where(eq(programCover.id, programId));
    else await tx.insert(programCover).values({ id: programId, ...row });
    return existing?.uri ?? null;
  });
}

/** Forgets the Program's cover photo and returns its uri (the caller deletes the file), or null. */
export function clearProgramCover(
  database: TrainingDatabase,
  programId: string,
  expectedInstallId?: string,
): Promise<string | null> {
  return write(database, expectedInstallId, async (tx) => {
    const removed = await tx
      .delete(programCover)
      .where(eq(programCover.id, programId))
      .returning({ uri: programCover.uri });
    return removed[0]?.uri ?? null;
  });
}

/**
 * Called once a deleted Program's Undo window has passed: forgets its cover when the Program is
 * still gone and returns the uri to delete, or null (it came back, or it had no cover).
 */
export function releaseProgramCover(
  database: TrainingDatabase,
  programId: string,
  expectedInstallId?: string,
): Promise<string | null> {
  return write(database, expectedInstallId, async (tx) => {
    const [live] = await tx
      .select({ id: program.id })
      .from(program)
      .where(eq(program.id, programId))
      .limit(1);
    if (live) return null;
    const removed = await tx
      .delete(programCover)
      .where(eq(programCover.id, programId))
      .returning({ uri: programCover.uri });
    return removed[0]?.uri ?? null;
  });
}

/**
 * Forgets the covers of Programs that no longer exist (deleted here or on another device, after
 * their Undo window) and returns the Program ids that are left. The caller deletes every cover
 * file that is not among them, which also removes the files of a wiped account.
 */
export function sweepProgramCovers(
  database: TrainingDatabase,
  expectedInstallId?: string,
): Promise<string[]> {
  return write(database, expectedInstallId, async (tx) => {
    const covers = await tx.select({ id: programCover.id }).from(programCover);
    const live = new Set((await tx.select({ id: program.id }).from(program)).map((row) => row.id));
    const gone = covers.map((cover) => cover.id).filter((id) => !live.has(id));
    if (gone.length > 0) await tx.delete(programCover).where(inArray(programCover.id, gone));
    return covers.map((cover) => cover.id).filter((id) => live.has(id));
  });
}
