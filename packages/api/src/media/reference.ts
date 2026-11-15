import type { DbExecutor } from "@workspace/db";
import type { MediaKind } from "@workspace/shared";

import { SyncRejection } from "../platform/sync/handler";
import { findMedia } from "./operations/lookup";

/**
 * Checks a reference from another vertical's row (a Program cover, a Custom exercise image) to a
 * media: it must exist, be the writer's and be of the expected kind. Another user's or a missing
 * media is refused the same way, so ids do not leak. `unchanged` skips the deleted check for a
 * reference that already stands (an Undo that puts a row back as it was).
 */
export async function assertMediaReference(
  db: DbExecutor,
  userId: string,
  mediaId: string,
  kind: MediaKind,
  options: { unchanged?: boolean } = {},
) {
  const found = await findMedia(db, userId, mediaId);
  if (found.kind !== "own" || found.row.kind !== kind) {
    throw new SyncRejection("MEDIA_REFERENCE_INVALID");
  }
  if (found.row.deletedAt !== null && !options.unchanged) {
    throw new SyncRejection("MEDIA_REFERENCE_INVALID");
  }
}
