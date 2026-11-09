import {
  CUSTOM_EXERCISE_LIMIT,
  customExerciseFields,
  customExerciseInput,
  MUSCLE_GROUPS,
} from "@workspace/shared";
import { sql } from "drizzle-orm";
import type { DbExecutor } from "@workspace/db";
import { z } from "zod";

import { SyncRejection, type SyncTableHandler } from "../platform/sync/handler";
import { countLiveCustom } from "./operations/count-live-custom";
import { rowAsInput, type ExercisePatch } from "./operations/custom-exercise";
import { createCustomExercise } from "./operations/create-custom-exercise";
import { exerciseOwnership } from "./operations/exercise-ownership";
import { exerciseTypeLocked } from "./operations/exercise-type-locked";
import { updateCustomExercise, type RetireChange } from "./operations/update-custom-exercise";

const exerciseId = z.uuid();
const newExerciseId = z.uuidv7();

// The client stores booleans as 0/1 and arrays as JSON text, and uploads them that way.
const wireBoolean = z
  .union([z.boolean(), z.literal(0), z.literal(1)])
  .transform((value) => value === true || value === 1);
const wireMuscles = z.union([
  z.array(z.enum(MUSCLE_GROUPS)),
  z
    .string()
    .transform((text, ctx) => {
      try {
        return JSON.parse(text);
      } catch {
        ctx.addIssue({ code: "custom", message: "not JSON" });
        return z.NEVER;
      }
    })
    .pipe(z.array(z.enum(MUSCLE_GROUPS))),
]);
const wireRetiredAt = z.iso.datetime({ offset: true }).nullable();

// Strict: a column the server owns (rank, aka, media keys, search terms, user_id, timestamps)
// is refused, not ignored.
const putData = z.strictObject({
  title: customExerciseFields.shape.title,
  primary_muscle: customExerciseFields.shape.primary_muscle,
  secondary_muscles: wireMuscles.default([]),
  equipment: customExerciseFields.shape.equipment,
  exercise_type: customExerciseFields.shape.exercise_type,
  is_full_bodyweight: wireBoolean.default(false),
  instructions: customExerciseFields.shape.instructions.default(null),
  retired_at: wireRetiredAt.default(null),
});
const patchData = z.strictObject({
  title: customExerciseFields.shape.title.optional(),
  primary_muscle: customExerciseFields.shape.primary_muscle.optional(),
  secondary_muscles: wireMuscles.optional(),
  equipment: customExerciseFields.shape.equipment.optional(),
  exercise_type: customExerciseFields.shape.exercise_type.optional(),
  is_full_bodyweight: wireBoolean.optional(),
  instructions: customExerciseFields.shape.instructions.optional(),
  retired_at: wireRetiredAt.optional(),
});

/**
 * Takes the user's exercise lock for the rest of the transaction. Taken before the row is read,
 * so every write of one user sees the previous one's committed result. A row lock
 * (`SELECT ... FOR UPDATE`) would not do: the live-count limit spans all of the user's rows, and
 * a create has no row to lock yet.
 */
async function lockUserExercises(db: DbExecutor, userId: string) {
  await db.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`exercise:${userId}`}, 0))`);
}

/** Refuses when one more live Custom exercise would pass the limit. Needs the user's lock held. */
async function assertRoomForLive(db: DbExecutor, userId: string, id: string) {
  if ((await countLiveCustom(db, userId, id)) >= CUSTOM_EXERCISE_LIMIT) {
    throw new SyncRejection("EXERCISE_LIMIT_REACHED");
  }
}

/**
 * Upload handler of the `exercise` table (ADR 0034). Only the writer's own Custom exercises can
 * be written: PUT creates (or replaces the fields of one's own), PATCH changes the sent fields,
 * and archive/restore is a PATCH of `retired_at`. Catalog rows are read-only, other users' rows
 * are refused, nothing is ever deleted, and server-owned columns are never taken from the client.
 */
export const exerciseSyncHandler: SyncTableHandler = {
  table: "exercise",
  async apply(db, userId, op) {
    const id = exerciseId.safeParse(op.id);
    if (!id.success) throw new SyncRejection("SYNC_INVALID_OP");

    if (op.op === "DELETE") throw new SyncRejection("EXERCISE_DELETE_NOT_ALLOWED");

    await lockUserExercises(db, userId);
    const ownership = await exerciseOwnership(db, userId, id.data);
    if (ownership.kind === "catalog") throw new SyncRejection("EXERCISE_CATALOG_READ_ONLY");

    if (op.op === "PUT") {
      if (ownership.kind === "other-user") throw new SyncRejection("SYNC_ID_CONFLICT");
      const data = putData.safeParse(op.opData ?? {});
      if (!data.success) throw new SyncRejection("SYNC_INVALID_OP");
      const { retired_at: retiredAt, ...fields } = data.data;
      const input = customExerciseInput.safeParse(fields);
      if (!input.success) throw new SyncRejection("SYNC_INVALID_OP");
      const retired = retiredAt !== null;

      if (ownership.kind === "absent") {
        if (!newExerciseId.safeParse(id.data).success) throw new SyncRejection("SYNC_INVALID_OP");
        if (!retired) await assertRoomForLive(db, userId, id.data);
        await createCustomExercise(db, userId, id.data, input.data, retired);
        return;
      }
      if (input.data.exercise_type !== ownership.row.exerciseType) {
        if (await exerciseTypeLocked(db, id.data)) throw new SyncRejection("EXERCISE_TYPE_LOCKED");
      }
      const wasRetired = ownership.row.retiredAt !== null;
      if (wasRetired && !retired) await assertRoomForLive(db, userId, id.data);
      await updateCustomExercise(db, userId, id.data, input.data, retired ? "archive" : "restore");
      return;
    }

    // PATCH of a row that is not the writer's own looks like a missing row.
    if (ownership.kind !== "own") throw new SyncRejection("SYNC_ROW_NOT_FOUND");
    const data = patchData.safeParse(op.opData ?? {});
    if (!data.success) throw new SyncRejection("SYNC_INVALID_OP");
    const { retired_at: retiredAt, ...changes } = data.data;
    const patch = customExerciseFields.partial().safeParse(changes);
    if (!patch.success) throw new SyncRejection("SYNC_INVALID_OP");
    const merged = customExerciseInput.safeParse({ ...rowAsInput(ownership.row), ...patch.data });
    if (!merged.success) throw new SyncRejection("SYNC_INVALID_OP");

    const newType = patch.data.exercise_type;
    if (newType !== undefined && newType !== ownership.row.exerciseType) {
      if (await exerciseTypeLocked(db, id.data)) throw new SyncRejection("EXERCISE_TYPE_LOCKED");
    }
    let retire: RetireChange;
    if (retiredAt !== undefined) {
      const wasRetired = ownership.row.retiredAt !== null;
      retire = retiredAt === null ? "restore" : "archive";
      if (retire === "restore" && wasRetired) await assertRoomForLive(db, userId, id.data);
    }
    const toWrite: ExercisePatch = patch.data;
    await updateCustomExercise(db, userId, id.data, toWrite, retire);
  },
  // Exercises are retired, never deleted: there are no tombstones to purge.
  async purgeTombstones() {
    return 0;
  },
};
