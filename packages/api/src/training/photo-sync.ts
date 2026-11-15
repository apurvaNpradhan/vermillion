import { and, count, eq, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import { MEDIA_LIMITS } from "@workspace/shared";
import { assertMediaReference, softDeleteMedia } from "../media/index";
import { SyncRejection, type SyncTableHandler } from "../platform/sync/handler";
import { liveSession, lockUserTraining } from "./operations/lookup";
import { accept, idOf, invalid, newRowId, restoreMarker } from "./sync-common";
import { sessionPhoto } from "./tables";

const fields = z.strictObject({
  session_id: z.uuid(),
  media_id: z.uuid(),
  position: z.number().finite(),
});
export const sessionPhotoSyncHandler: SyncTableHandler = {
  table: "session_photo",
  async apply(db, userId, op) {
    const id = idOf(op.id);
    await lockUserTraining(db, userId);
    const [row] = await db.select().from(sessionPhoto).where(eq(sessionPhoto.id, id)).limit(1);
    if (row && row.userId !== userId) throw new SyncRejection("SYNC_ROW_NOT_FOUND");
    if (op.op === "DELETE") {
      if (!row) throw new SyncRejection("SYNC_ROW_NOT_FOUND");
      if (row.deletedAt !== null) {
        await softDeleteMedia(db, userId, row.mediaId);
        return;
      }
      await db
        .update(sessionPhoto)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(eq(sessionPhoto.id, id));
      await softDeleteMedia(db, userId, row.mediaId);
      return;
    }
    if (row?.deletedAt) throw new SyncRejection("SYNC_ROW_DELETED");
    if (op.op === "PATCH" && !row) throw new SyncRejection("SYNC_ROW_NOT_FOUND");
    const patch = accept(
      (op.op === "PUT"
        ? fields.extend({ restore: restoreMarker })
        : fields.pick({ position: true }).partial()
      ).safeParse(op.opData ?? {}),
    );
    const values = accept(
      fields.safeParse({
        session_id: row?.sessionId,
        media_id: row?.mediaId,
        position: row?.position,
        ...fields.strip().partial().parse(patch),
      }),
    );
    if (row && (row.sessionId !== values.session_id || row.mediaId !== values.media_id)) invalid();
    if (!(await liveSession(db, userId, values.session_id)))
      throw new SyncRejection("SESSION_PARENT_NOT_FOUND");
    await assertMediaReference(db, userId, values.media_id, "session_photo");
    const [taken] = await db
      .select({ id: sessionPhoto.id })
      .from(sessionPhoto)
      .where(and(eq(sessionPhoto.mediaId, values.media_id), ne(sessionPhoto.id, id)))
      .limit(1);
    if (taken) throw new SyncRejection("MEDIA_REFERENCE_INVALID");
    if (!row) {
      accept(newRowId.safeParse(id));
      const [total] = await db
        .select({ n: count() })
        .from(sessionPhoto)
        .where(and(eq(sessionPhoto.sessionId, values.session_id), isNull(sessionPhoto.deletedAt)));
      if ((total?.n ?? 0) >= MEDIA_LIMITS.sessionPhotos)
        throw new SyncRejection("TRAINING_LIMIT_REACHED");
      await db.insert(sessionPhoto).values({
        id,
        userId,
        sessionId: values.session_id,
        mediaId: values.media_id,
        position: values.position,
      });
    } else
      await db
        .update(sessionPhoto)
        .set({ position: values.position, updatedAt: new Date() })
        .where(eq(sessionPhoto.id, id));
  },
  // Retain the minimal row as the deleted-id marker, just as media does.
  async purgeTombstones() {
    return 0;
  },
};
