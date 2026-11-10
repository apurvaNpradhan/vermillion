import { v7 as uuidv7 } from "uuid";

import { and, count, eq, ne } from "drizzle-orm";

import { keyAfterLast, sortByPosition } from "./position";
import { program, programSlot, workout, workoutExercise } from "./tables";

import {
  type TrainingDatabase,
  type WorkoutRow,
  type Tx,
  write,
  ownerOf,
  nowIso,
  assertRoom,
  totalOf,
  liveWorkouts,
  livePrograms,
  slotsIn,
  slotListOf,
  rebalanceSlots,
  assertProgramExists,
} from "./store-common";
import { deleteWorkoutIn } from "./workout-store";

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
