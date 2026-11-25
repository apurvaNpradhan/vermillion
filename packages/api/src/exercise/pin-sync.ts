import { exercisePinId, exercisePinUuid } from "@workspace/shared";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { SyncRejection, type SyncTableHandler } from "../platform/sync/handler";
import { exerciseOwnership } from "./operations/exercise-ownership";
import { exercisePin } from "./tables";

const putPin = z.strictObject({ exercise_id: exercisePinUuid });

export const exercisePinSyncHandler: SyncTableHandler = {
  table: "exercise_pin",
  async apply(db, userId, op) {
    const parsedId = exercisePinUuid.safeParse(op.id);
    if (!parsedId.success) throw new SyncRejection("SYNC_INVALID_OP");
    const id = parsedId.data;
    const owned = and(eq(exercisePin.id, id), eq(exercisePin.userId, userId));

    if (op.op === "DELETE") {
      const [row] = await db
        .select({ userId: exercisePin.userId })
        .from(exercisePin)
        .where(eq(exercisePin.id, id))
        .limit(1);
      if (row && row.userId !== userId) throw new SyncRejection("SYNC_ROW_NOT_FOUND");
      await db
        .update(exercisePin)
        .set({ deletedAt: new Date() })
        .where(and(owned, isNull(exercisePin.deletedAt)));
      return;
    }

    if (op.op !== "PUT") throw new SyncRejection("SYNC_INVALID_OP");
    const fields = putPin.safeParse(op.opData);
    if (!fields.success || id !== exercisePinId(userId, fields.data.exercise_id)) {
      throw new SyncRejection("SYNC_INVALID_OP");
    }
    const exerciseId = fields.data.exercise_id;
    const visible = await exerciseOwnership(db, userId, exerciseId);
    if (visible.kind === "absent" || visible.kind === "other-user") {
      throw new SyncRejection("SYNC_ROW_NOT_FOUND");
    }

    // The conflict update is atomic even when two devices create the first pin together.
    const [pin] = await db
      .insert(exercisePin)
      .values({ id, userId, exerciseId })
      .onConflictDoUpdate({
        target: exercisePin.id,
        set: { deletedAt: null },
        setWhere: and(eq(exercisePin.userId, userId), eq(exercisePin.exerciseId, exerciseId)),
      })
      .returning({ id: exercisePin.id });
    if (!pin) throw new SyncRejection("SYNC_ID_CONFLICT");
  },
  // Like slot skips, the tombstone is already the minimal record and can always be revived.
  purgeTombstones: async () => 0,
};
