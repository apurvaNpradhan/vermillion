import type { DbExecutor } from "@workspace/db";
import { and, eq } from "drizzle-orm";

import { media } from "../tables";

export type MediaRow = typeof media.$inferSelect;

/** Who a media row belongs to, from one writer's point of view. A deleted row is still "own". */
export type MediaOwnership =
  | { kind: "absent" }
  | { kind: "other-user" }
  | { kind: "own"; row: MediaRow };

export async function findMedia(
  db: DbExecutor,
  userId: string,
  mediaId: string,
): Promise<MediaOwnership> {
  const [row] = await db.select().from(media).where(eq(media.id, mediaId)).limit(1);
  if (!row) return { kind: "absent" };
  return row.userId === userId ? { kind: "own", row } : { kind: "other-user" };
}

/** A media of this user that is not deleted, or undefined (also for another user's media). */
export async function findLiveMedia(db: DbExecutor, userId: string, mediaId: string) {
  const found = await findMedia(db, userId, mediaId);
  return found.kind === "own" && found.row.deletedAt === null ? found.row : undefined;
}

/** Soft-deletes a media of this user. Idempotent: a deleted or foreign media is left alone. */
export async function softDeleteMedia(db: DbExecutor, userId: string, mediaId: string) {
  await db
    .update(media)
    .set({ deletedAt: new Date() })
    .where(and(eq(media.id, mediaId), eq(media.userId, userId)));
}
