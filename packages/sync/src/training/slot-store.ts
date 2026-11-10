import { v7 as uuidv7 } from "uuid";

import { and, count, eq, ne } from "drizzle-orm";

import { keyAfterLast, keyForMove } from "./position";
import { programSlot, workout } from "./tables";

import {
  type TrainingDatabase,
  type ProgramSlotRow,
  type DeletedWorkout,
  type Tx,
  write,
  ownerOf,
  marked,
  nowIso,
  assertRoom,
  totalOf,
  slotsIn,
  slotListOf,
  rebalanceSlots,
  assertProgramExists,
} from "./store-common";
import { deleteWorkoutIn, restoreWorkout } from "./workout-store";
// ---- Slots ----

export async function assertWorkoutInProgram(tx: Tx, programId: string, workoutId: string | null) {
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
