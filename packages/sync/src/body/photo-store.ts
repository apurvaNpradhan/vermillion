import { progressPhotoInput, type ProgressPhotoInput } from "@workspace/shared";
import { eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";

import {
  insertMedia,
  media,
  removeMedia,
  writeMedia,
  type MediaDatabase,
  type MediaTx,
  type NewMedia,
} from "../media";
import { progressPhoto } from "./tables";

export type ProgressPhotoRow = typeof progressPhoto.$inferSelect;

/** A photo to add: its image (already processed, files already handed to the queue) and its day. */
export type NewProgressPhoto = Pick<ProgressPhotoInput, "pose" | "local_date" | "taken_at"> & {
  /** What the device knows about the processed image; `media.id` names the files. */
  media: Omit<NewMedia, "kind"> & { id: string };
};

/**
 * Adds a progress photo (ADR 0041): the `media` row and the photo that points at it are written in
 * one local transaction, so they upload as one unit and the server never sees a reference to a
 * media it has not got (`setProgramCoverToNewMedia` is the pattern). The photo shows at once from
 * the local file. Returns the photo's id. A Check-in with photos uses `saveCheckIn` instead.
 */
export function addProgressPhoto(
  database: MediaDatabase,
  input: NewProgressPhoto,
  expectedInstallId?: string,
): Promise<string> {
  return writeMedia(database, expectedInstallId, (tx) => insertProgressPhoto(tx, input));
}

/** Writes a photo's media row and the photo inside a transaction the caller owns. Returns the id. */
export async function insertProgressPhoto(tx: MediaTx, input: NewProgressPhoto): Promise<string> {
  const values = progressPhotoInput.parse({
    media_id: input.media.id,
    pose: input.pose,
    local_date: input.local_date,
    taken_at: input.taken_at,
  });
  // The media goes first: its upload must precede the PUT that references it.
  const mediaId = await insertMedia(tx, { ...input.media, kind: "progress_photo" });
  const [owner] = await tx
    .select({ userId: media.user_id })
    .from(media)
    .where(eq(media.id, mediaId))
    .limit(1);
  if (!owner) throw new Error("The media was not written");
  const id = uuidv7();
  await tx.insert(progressPhoto).values({
    id,
    user_id: owner.userId,
    ...values,
    created_at: new Date().toISOString(),
  });
  return id;
}

/**
 * Deletes a progress photo and its media in one transaction (they upload as one unit and the
 * server removes the files within a day). Returns the deleted media's id so the caller can drop
 * the device's files at once, or null if the photo was already gone.
 */
export function deleteProgressPhoto(
  database: MediaDatabase,
  id: string,
  expectedInstallId?: string,
): Promise<string | null> {
  return writeMedia(database, expectedInstallId, async (tx) => {
    const [row] = await tx
      .select({ mediaId: progressPhoto.media_id })
      .from(progressPhoto)
      .where(eq(progressPhoto.id, id))
      .limit(1);
    if (!row) return null;
    await tx.delete(progressPhoto).where(eq(progressPhoto.id, id));
    await removeMedia(tx, row.mediaId);
    return row.mediaId;
  });
}
