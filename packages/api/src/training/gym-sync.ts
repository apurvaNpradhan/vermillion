import {
  gymExerciseSettingId,
  gymExerciseSettingInput,
  gymInput,
  loadRangesSchema,
} from "@workspace/shared";
import type { DbExecutor } from "@workspace/db";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { SyncRejection, type SyncTableHandler } from "../platform/sync/handler";
import { deleteGymCascade } from "./operations/gyms";
import {
  countLiveGyms,
  findGym,
  findGymExerciseSetting,
  liveGym,
  lockUserTraining,
  visibleExerciseType,
} from "./operations/lookup";
import {
  accept,
  checkPut,
  idOf,
  invalid,
  liveRow,
  newRowId,
  now,
  ownRow,
  restoreMarker,
} from "./sync-common";
import { gym, gymExerciseSetting } from "./tables";

// ---- Gym ----

const putGym = z.strictObject({ restore: restoreMarker, name: gymInput.shape.name });
const patchGym = z.strictObject({ name: gymInput.shape.name }).partial();

const gymSyncHandler: SyncTableHandler = {
  table: "gym",
  async apply(db, userId, op) {
    const id = idOf(op.id);
    await lockUserTraining(db, userId);
    const found = await findGym(db, userId, id);

    if (op.op === "DELETE") {
      const row = ownRow(found);
      if (row.deletedAt !== null) return;
      // The last gym stays: Sessions, the kit and every exercise setting hang off one.
      if ((await countLiveGyms(db, userId, id)) === 0) {
        throw new SyncRejection("SYNC_CONSTRAINT_VIOLATION");
      }
      await deleteGymCascade(db, id, now());
      return;
    }

    if (op.op === "PUT") {
      if (found.kind === "other-user") throw new SyncRejection("SYNC_ID_CONFLICT");
      const { restore, ...values } = accept(putGym.safeParse(op.opData ?? {}));
      checkPut(found, restore);
      if (found.kind === "absent") {
        accept(newRowId.safeParse(id));
        await db.insert(gym).values({ id, userId, name: values.name });
        return;
      }
      await db
        .update(gym)
        .set({ name: values.name, deletedAt: null, updatedAt: now() })
        .where(eq(gym.id, id));
      return;
    }

    const row = liveRow(found);
    const patch = accept(patchGym.safeParse(op.opData ?? {}));
    if (patch.name === undefined) return;
    await db.update(gym).set({ name: patch.name, updatedAt: now() }).where(eq(gym.id, row.id));
  },
  purgeTombstones: async () => 0,
};

// ---- Gym exercise setting ----

// The client stores the ranges as JSON text and uploads them that way.
const wireRanges = z
  .string()
  .transform((text, ctx) => {
    try {
      return JSON.parse(text);
    } catch {
      ctx.addIssue({ code: "custom", message: "not JSON" });
      return z.NEVER;
    }
  })
  .pipe(loadRangesSchema);

const putSetting = z.strictObject({
  restore: restoreMarker,
  gym_id: gymExerciseSettingInput.shape.gym_id,
  exercise_id: gymExerciseSettingInput.shape.exercise_id,
  load_ranges: wireRanges.optional(),
  setup_note: gymExerciseSettingInput.shape.setup_note.optional(),
});
// A setting belongs to one gym and one exercise for good.
const patchSetting = z
  .strictObject({
    load_ranges: wireRanges,
    setup_note: gymExerciseSettingInput.shape.setup_note,
  })
  .partial();

async function liveSettingOf(db: DbExecutor, userId: string, gymId: string, exerciseId: string) {
  const [row] = await db
    .select()
    .from(gymExerciseSetting)
    .where(
      and(
        eq(gymExerciseSetting.userId, userId),
        eq(gymExerciseSetting.gymId, gymId),
        eq(gymExerciseSetting.exerciseId, exerciseId),
        isNull(gymExerciseSetting.deletedAt),
      ),
    )
    .limit(1);
  return row;
}

const gymExerciseSettingSyncHandler: SyncTableHandler = {
  table: "gym_exercise_setting",
  async apply(db, userId, op) {
    const id = idOf(op.id);
    await lockUserTraining(db, userId);
    const found = await findGymExerciseSetting(db, userId, id);

    if (op.op === "DELETE") {
      const row = ownRow(found);
      if (row.deletedAt === null) {
        const at = now();
        await db
          .update(gymExerciseSetting)
          .set({ deletedAt: at, updatedAt: at })
          .where(eq(gymExerciseSetting.id, id));
      }
      return;
    }

    if (op.op === "PUT") {
      // The row's id is made of the user, gym and exercise, so it cannot belong to another user.
      if (found.kind === "other-user") throw new SyncRejection("SYNC_ID_CONFLICT");
      // The restore marker is accepted but not needed: a PUT of a setting is always an upsert.
      const put = accept(putSetting.safeParse(op.opData ?? {}));
      const values = accept(
        gymExerciseSettingInput.safeParse({
          gym_id: put.gym_id,
          exercise_id: put.exercise_id,
          load_ranges: put.load_ranges ?? [],
          setup_note: put.setup_note ?? null,
        }),
      );
      if (
        found.kind === "own" &&
        (found.row.gymId !== values.gym_id || found.row.exerciseId !== values.exercise_id)
      )
        return invalid();
      if (!(await liveGym(db, userId, values.gym_id))) {
        throw new SyncRejection("SESSION_PARENT_NOT_FOUND");
      }
      if (!(await visibleExerciseType(db, userId, values.exercise_id))) {
        throw new SyncRejection("SESSION_PARENT_NOT_FOUND");
      }
      const existing = await liveSettingOf(db, userId, values.gym_id, values.exercise_id);
      // Two devices that each create the setting offline send the same id. The later PUT meets a
      // live row and adds what it holds: a range list or a note the first did not have. Clearing a
      // field is a PATCH, which the creating device can send once its row exists.
      if (existing) {
        await db
          .update(gymExerciseSetting)
          .set({
            ...(values.load_ranges.length > 0 ? { loadRanges: values.load_ranges } : {}),
            ...(values.setup_note !== null ? { setupNote: values.setup_note } : {}),
            updatedAt: now(),
          })
          .where(eq(gymExerciseSetting.id, existing.id));
        return;
      }
      // A setting that was deleted comes back under its own id with exactly these values.
      if (found.kind === "own") {
        await db
          .update(gymExerciseSetting)
          .set({
            loadRanges: values.load_ranges,
            setupNote: values.setup_note,
            deletedAt: null,
            updatedAt: now(),
          })
          .where(eq(gymExerciseSetting.id, id));
        return;
      }
      // A new setting has the one id its user, gym and exercise make.
      if (
        id !==
        gymExerciseSettingId({ userId, gymId: values.gym_id, exerciseId: values.exercise_id })
      ) {
        invalid();
      }
      await db.insert(gymExerciseSetting).values({
        id,
        userId,
        gymId: values.gym_id,
        exerciseId: values.exercise_id,
        loadRanges: values.load_ranges,
        setupNote: values.setup_note,
      });
      return;
    }

    const row = liveRow(found);
    const patch = accept(patchSetting.safeParse(op.opData ?? {}));
    await db
      .update(gymExerciseSetting)
      .set({
        ...(patch.load_ranges !== undefined ? { loadRanges: patch.load_ranges } : {}),
        ...(patch.setup_note !== undefined ? { setupNote: patch.setup_note } : {}),
        updatedAt: now(),
      })
      .where(eq(gymExerciseSetting.id, row.id));
  },
  purgeTombstones: async () => 0,
};

/**
 * Upload handlers of the gym tables: the same rules as the other Session tables (strict data, the
 * writer's own rows, dirty-field PATCH, soft delete). Deleting a gym takes its kit and settings
 * with it and nulls `gym_id` on its Sessions; the last gym cannot be deleted.
 */
export const gymSyncHandlers: readonly SyncTableHandler[] = [
  gymSyncHandler,
  gymExerciseSettingSyncHandler,
];
