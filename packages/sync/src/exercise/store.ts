import type { AbstractPowerSyncDatabase } from "@powersync/common";
import { wrapPowerSyncWithDrizzle } from "@powersync/drizzle-driver";
import {
  CUSTOM_EXERCISE_LIMIT,
  customExerciseFields,
  customExerciseInput,
  type CustomExerciseInput,
} from "@workspace/shared";
import { and, count, eq, isNotNull, isNull } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";

import { DEVICE_OWNER_ID } from "../platform/device-owner";
import { drizzleSchema } from "../platform/schema";
import { deviceOwner, installMeta } from "../platform/tables";
import { exercise } from "./tables";

/** Columns of `exercise` the server accepts in an upload; the rest are written locally only. */
export const exerciseUploadColumns: ReadonlySet<string> = new Set([
  "title",
  "primary_muscle",
  "secondary_muscles",
  "equipment",
  "exercise_type",
  "is_full_bodyweight",
  "instructions",
  "retired_at",
]);

export type ExerciseDatabase = AbstractPowerSyncDatabase;
export type ExercisePatch = Partial<CustomExerciseInput>;

const clients = new WeakMap<ExerciseDatabase, ReturnType<typeof open>>();

function open(database: ExerciseDatabase) {
  return wrapPowerSyncWithDrizzle(database, { schema: drizzleSchema });
}

function localExercises(database: ExerciseDatabase) {
  const existing = clients.get(database);
  if (existing) return existing;
  const created = open(database);
  clients.set(database, created);
  return created;
}

type ExerciseTx = Parameters<Parameters<ReturnType<typeof open>["transaction"]>[0]>[0];

/**
 * UI writers capture the install id before editing and check it under the same SQLite write lock
 * as the mutation, so a device reset in another tab cannot hand an old submission to the new
 * owner (ADR 0021).
 */
async function assertWriteScope(tx: ExerciseTx, expectedInstallId?: string): Promise<void> {
  if (expectedInstallId === undefined) return;
  const [install] = await tx
    .select({ id: installMeta.id })
    .from(installMeta)
    .where(eq(installMeta.install_id, expectedInstallId))
    .limit(1);
  if (!install) throw new Error("The device account changed; reopen the form");
}

/** Creates a Custom exercise for the Device owner with a client UUIDv7; it uploads as a PUT. */
export async function createCustomExercise(
  database: ExerciseDatabase,
  input: CustomExerciseInput,
  expectedInstallId?: string,
): Promise<string> {
  const values = customExerciseInput.parse(input);
  return localExercises(database).transaction(async (tx) => {
    await assertWriteScope(tx, expectedInstallId);
    const [owner] = await tx
      .select({ userId: deviceOwner.user_id })
      .from(deviceOwner)
      .where(eq(deviceOwner.id, DEVICE_OWNER_ID))
      .limit(1);
    if (!owner) throw new Error("No Device owner: sign in first");
    const [live] = await tx
      .select({ total: count() })
      .from(exercise)
      .where(and(isNotNull(exercise.user_id), isNull(exercise.retired_at)));
    if ((live?.total ?? 0) >= CUSTOM_EXERCISE_LIMIT) {
      throw new Error("Too many custom exercises: archive some first");
    }
    const id = uuidv7();
    await tx.insert(exercise).values({
      id,
      user_id: owner.userId,
      ...values,
      created_at: new Date().toISOString(),
    });
    return id;
  });
}

/**
 * Changes only the fields of the patch that differ from the stored Custom exercise (a form passes
 * its dirty fields). Catalog rows are never written. Returns whether anything was written.
 */
export async function updateCustomExercise(
  database: ExerciseDatabase,
  id: string,
  patch: ExercisePatch,
  expectedInstallId?: string,
): Promise<boolean> {
  const fields = customExerciseFields.partial().parse(patch);
  return localExercises(database).transaction(async (tx) => {
    await assertWriteScope(tx, expectedInstallId);
    const [current] = await tx
      .select()
      .from(exercise)
      .where(and(eq(exercise.id, id), isNotNull(exercise.user_id)))
      .limit(1);
    if (!current) return false;
    const stored = {
      title: current.title,
      primary_muscle: current.primary_muscle,
      secondary_muscles: current.secondary_muscles,
      equipment: current.equipment,
      exercise_type: current.exercise_type,
      is_full_bodyweight: current.is_full_bodyweight,
      instructions: current.instructions,
    };
    const changes: ExercisePatch = {
      ...(fields.title !== undefined && fields.title !== stored.title
        ? { title: fields.title }
        : {}),
      ...(fields.primary_muscle !== undefined && fields.primary_muscle !== stored.primary_muscle
        ? { primary_muscle: fields.primary_muscle }
        : {}),
      ...(fields.secondary_muscles !== undefined &&
      JSON.stringify(fields.secondary_muscles) !== JSON.stringify(stored.secondary_muscles)
        ? { secondary_muscles: fields.secondary_muscles }
        : {}),
      ...(fields.equipment !== undefined && fields.equipment !== stored.equipment
        ? { equipment: fields.equipment }
        : {}),
      ...(fields.exercise_type !== undefined && fields.exercise_type !== stored.exercise_type
        ? { exercise_type: fields.exercise_type }
        : {}),
      ...(fields.is_full_bodyweight !== undefined &&
      fields.is_full_bodyweight !== stored.is_full_bodyweight
        ? { is_full_bodyweight: fields.is_full_bodyweight }
        : {}),
      ...(fields.instructions !== undefined && fields.instructions !== stored.instructions
        ? { instructions: fields.instructions }
        : {}),
    };
    if (Object.keys(changes).length === 0) return false;
    customExerciseInput.parse({ ...stored, ...changes });
    await tx.update(exercise).set(changes).where(eq(exercise.id, id));
    return true;
  });
}

async function setRetired(
  database: ExerciseDatabase,
  id: string,
  retiredAt: string | null,
  expectedInstallId?: string,
): Promise<boolean> {
  return localExercises(database).transaction(async (tx) => {
    await assertWriteScope(tx, expectedInstallId);
    const changed = await tx
      .update(exercise)
      .set({ retired_at: retiredAt })
      .where(and(eq(exercise.id, id), isNotNull(exercise.user_id)))
      .returning({ id: exercise.id });
    return changed.length > 0;
  });
}

/** Archives a Custom exercise (never deleted: a set on another device may use it). */
export function archiveExercise(
  database: ExerciseDatabase,
  id: string,
  expectedInstallId?: string,
): Promise<boolean> {
  return setRetired(database, id, new Date().toISOString(), expectedInstallId);
}

/** Brings an archived Custom exercise back. */
export function restoreExercise(
  database: ExerciseDatabase,
  id: string,
  expectedInstallId?: string,
): Promise<boolean> {
  return setRetired(database, id, null, expectedInstallId);
}
