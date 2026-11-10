import { v7 as uuidv7 } from "uuid";

import { programInput, type ProgramInput } from "@workspace/shared";
import { and, eq, inArray, isNull } from "drizzle-orm";

import { programRun, program, programSlot, workout, workoutExercise } from "./tables";

import {
  type TrainingDatabase,
  type DeletedProgram,
  write,
  ownerOf,
  marked,
  nowIso,
  assertRoom,
  livePrograms,
  changedFields,
} from "./store-common";
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
    await tx
      .update(programRun)
      .set({ finished_at: nowIso(), outcome: "stopped" })
      .where(and(eq(programRun.program_id, id), isNull(programRun.finished_at)));
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
