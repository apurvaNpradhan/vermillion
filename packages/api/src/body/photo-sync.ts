import { progressPhotoInput } from "@workspace/shared";
import { and, eq, lt, sql } from "drizzle-orm";
import { z } from "zod";

import { assertMediaReference, softDeleteMedia } from "../media/index";
import { SyncRejection, type SyncTableHandler } from "../platform/sync/handler";
import { deletedProgressPhoto, progressPhoto } from "./tables";

/**
 * Upload handler of `progress_photo` (ADR 0041). A photo is written once: a PUT of an existing row
 * must repeat what is stored (a replayed upload), a PATCH changes nothing, and DELETE is a soft
 * delete that deletes the photo's media with it, so the files go within a day (ADR 0040). The
 * media must be the writer's own, live and of kind `progress_photo`; a foreign, missing or
 * wrong-kind media is refused alike (`MEDIA_REFERENCE_INVALID`).
 */
export const progressPhotoSyncHandler: SyncTableHandler = {
  table: "progress_photo",
  async apply(db, userId, op) {
    if (!z.uuid().safeParse(op.id).success) throw new SyncRejection("SYNC_INVALID_OP");
    await db.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId}))`);
    const [marker] = await db
      .select()
      .from(deletedProgressPhoto)
      .where(eq(deletedProgressPhoto.id, op.id))
      .limit(1);
    if (marker)
      throw new SyncRejection(marker.userId === userId ? "SYNC_ROW_DELETED" : "SYNC_ID_CONFLICT");
    const [row] = await db.select().from(progressPhoto).where(eq(progressPhoto.id, op.id)).limit(1);
    if (row && row.userId !== userId)
      throw new SyncRejection(op.op === "PUT" ? "SYNC_ID_CONFLICT" : "SYNC_ROW_NOT_FOUND");

    if (op.op === "DELETE") {
      if (!row) throw new SyncRejection("SYNC_ROW_NOT_FOUND");
      if (!row.deletedAt) {
        await db
          .update(progressPhoto)
          .set({ deletedAt: new Date(), updatedAt: new Date() })
          .where(eq(progressPhoto.id, op.id));
      }
      // Idempotent, and also covers a photo whose own media DELETE never arrived.
      await softDeleteMedia(db, userId, row.mediaId);
      return;
    }

    if (op.op === "PATCH") {
      if (!row) throw new SyncRejection("SYNC_ROW_NOT_FOUND");
      if (row.deletedAt) throw new SyncRejection("SYNC_ROW_DELETED");
      if (Object.keys(op.opData ?? {}).length > 0) throw new SyncRejection("SYNC_INVALID_OP");
      return;
    }

    const parsed = progressPhotoInput.safeParse(op.opData ?? {});
    if (!parsed.success) throw new SyncRejection("SYNC_INVALID_OP");
    const v = parsed.data;

    if (row) {
      if (row.deletedAt) throw new SyncRejection("SYNC_ROW_DELETED");
      const same =
        row.mediaId === v.media_id &&
        row.pose === v.pose &&
        row.localDate === v.local_date &&
        row.takenAt.getTime() === Date.parse(v.taken_at);
      if (!same) throw new SyncRejection("SYNC_INVALID_OP");
      return;
    }

    if (!z.uuidv7().safeParse(op.id).success) throw new SyncRejection("SYNC_INVALID_OP");
    await assertMediaReference(db, userId, v.media_id, "progress_photo");
    // One photo per media: a second row naming it would let a delete of one remove the other's file.
    const [taken] = await db
      .select({ id: progressPhoto.id })
      .from(progressPhoto)
      .where(eq(progressPhoto.mediaId, v.media_id))
      .limit(1);
    if (taken) throw new SyncRejection("MEDIA_REFERENCE_INVALID");
    await db.insert(progressPhoto).values({
      id: op.id,
      userId,
      mediaId: v.media_id,
      pose: v.pose,
      takenAt: new Date(v.taken_at),
      localDate: v.local_date,
    });
  },
  async purgeTombstones(db, olderThan) {
    const rows = await db
      .select({ id: progressPhoto.id, userId: progressPhoto.userId })
      .from(progressPhoto)
      .where(lt(progressPhoto.deletedAt, olderThan));
    for (const row of rows) {
      await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${row.userId}))`);
        const [removed] = await tx
          .delete(progressPhoto)
          .where(and(eq(progressPhoto.id, row.id), lt(progressPhoto.deletedAt, olderThan)))
          .returning({ id: progressPhoto.id });
        if (removed) await tx.insert(deletedProgressPhoto).values(row).onConflictDoNothing();
      });
    }
    return rows.length;
  },
};
