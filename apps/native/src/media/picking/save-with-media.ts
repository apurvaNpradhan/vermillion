import type { MediaQueue } from "@/media/queue/attachment-queue";

/**
 * Saves a new media together with what points at it (a Program's cover, later an avatar or a
 * photo): the files go to the queue first, then `commit` writes the media row and the reference
 * in one local transaction, and the media it replaced is released.
 *
 * `commit` resolves to the id of the media it replaced (or null for none), or to `null` itself when
 * it did not write (a refused write that already told the user). The new files are dropped only if
 * the write did not commit: once it has, the new media is the truth, and failing to delete the
 * old files is not worth losing it (they are cleaned up by the queue, or with the account).
 * Resolves to whether the media was saved; a write that throws drops the files and rethrows.
 */
export async function saveWithMedia(
  queue: Pick<MediaQueue, "addFiles" | "discard">,
  files: { fullUri: string; thumbUri: string },
  mediaId: string,
  commit: () => Promise<{ replaced: string | null } | null>,
): Promise<boolean> {
  await queue.addFiles(mediaId, files);
  let result: { replaced: string | null } | null;
  try {
    result = await commit();
  } catch (error) {
    await queue.discard(mediaId).catch(() => undefined);
    throw error;
  }
  if (result === null) {
    await queue.discard(mediaId).catch(() => undefined);
    return false;
  }
  if (result.replaced !== null) await queue.discard(result.replaced).catch(() => undefined);
  return true;
}
