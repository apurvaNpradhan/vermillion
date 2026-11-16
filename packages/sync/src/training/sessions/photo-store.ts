import { and, asc, eq } from "drizzle-orm";
import { MEDIA_LIMITS } from "@workspace/shared";
import { v7 as uuidv7 } from "uuid";
import {
  insertMedia,
  removeMedia,
  writeMedia,
  type MediaDatabase,
  type NewMedia,
} from "../../media/index";
import { session, sessionPhoto } from "../tables";

export function addSessionPhoto(
  database: MediaDatabase,
  sessionId: string,
  image: Omit<NewMedia, "kind">,
  scope?: string,
) {
  return writeMedia(database, scope, async (tx) => {
    const [parent] = await tx.select().from(session).where(eq(session.id, sessionId)).limit(1);
    if (!parent) throw new Error("Session not found");
    const rows = await tx
      .select()
      .from(sessionPhoto)
      .where(eq(sessionPhoto.session_id, sessionId))
      .orderBy(asc(sessionPhoto.position), asc(sessionPhoto.id))
      .limit(MEDIA_LIMITS.sessionPhotos);
    if (rows.length >= MEDIA_LIMITS.sessionPhotos) throw new Error("Session photo limit reached");
    const mediaId = await insertMedia(tx, { ...image, kind: "session_photo" });
    await tx.insert(sessionPhoto).values({
      id: uuidv7(),
      user_id: parent.user_id,
      session_id: sessionId,
      media_id: mediaId,
      position: (rows.at(-1)?.position ?? -1) + 1,
      created_at: new Date().toISOString(),
    });
    return mediaId;
  });
}
export function removeSessionPhoto(database: MediaDatabase, id: string, scope?: string) {
  return writeMedia(database, scope, async (tx) => {
    const [row] = await tx.delete(sessionPhoto).where(eq(sessionPhoto.id, id)).returning();
    if (!row) return null;
    await removeMedia(tx, row.media_id);
    return row.media_id;
  });
}
export function moveSessionPhoto(
  database: MediaDatabase,
  sessionId: string,
  id: string,
  position: number,
  scope?: string,
) {
  if (!Number.isFinite(position)) throw new Error("Invalid position");
  return writeMedia(database, scope, async (tx) => {
    await tx
      .update(sessionPhoto)
      .set({ position })
      .where(and(eq(sessionPhoto.id, id), eq(sessionPhoto.session_id, sessionId)));
  });
}

/** Releases a discarded Session's files after Undo, only while the Session is still absent. */
export function releaseSessionPhotos(
  database: MediaDatabase,
  sessionId: string,
  mediaIds: readonly string[],
  scope?: string,
) {
  return writeMedia(database, scope, async (tx) => {
    const [live] = await tx
      .select({ id: session.id })
      .from(session)
      .where(eq(session.id, sessionId))
      .limit(1);
    if (live) return [];
    await tx.delete(sessionPhoto).where(eq(sessionPhoto.session_id, sessionId)).returning();
    const released: string[] = [];
    for (const mediaId of mediaIds) {
      if (await removeMedia(tx, mediaId)) released.push(mediaId);
    }
    return released;
  });
}
