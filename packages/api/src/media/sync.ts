import { mediaInput } from "@workspace/shared";
import { z } from "zod";

import { SyncRejection, type SyncTableHandler } from "../platform/sync/handler";
import { findMedia, softDeleteMedia } from "./operations/lookup";
import { media } from "./tables";

const rowId = z.uuid();
/** A new row must carry a UUIDv7 made on the device. */
const newRowId = z.uuidv7();

/** A media is written once: this is everything a PUT may carry. */
const putMedia = mediaInput;

/**
 * Upload handler of `media` (ADR 0040). A media row is immutable after it is created: a PUT of
 * an existing row is accepted only when it repeats the stored values (a replayed upload), a PATCH
 * is refused, and DELETE soft-deletes unshared media. A deleted media is never restored. A new image is a
 * new row. The files are not in the upload: the device sends them with presigned URLs.
 */
export const mediaSyncHandler: SyncTableHandler = {
  table: "media",
  async apply(db, userId, op) {
    const id = rowId.safeParse(op.id);
    if (!id.success) throw new SyncRejection("SYNC_INVALID_OP");
    const found = await findMedia(db, userId, id.data);

    if (op.op === "DELETE") {
      if (found.kind !== "own") throw new SyncRejection("SYNC_ROW_NOT_FOUND");
      // Older clients may queue cover deletes alongside a replacement. Only the cover
      // cleanup job can retire shared cover media.
      if (found.row.kind === "program_cover" || found.row.kind === "workout_cover") return;
      if (found.row.deletedAt === null) await softDeleteMedia(db, userId, id.data);
      return;
    }

    if (op.op === "PATCH") {
      if (found.kind !== "own") throw new SyncRejection("SYNC_ROW_NOT_FOUND");
      if (found.row.deletedAt !== null) throw new SyncRejection("SYNC_ROW_DELETED");
      if (Object.keys(op.opData ?? {}).length > 0) throw new SyncRejection("MEDIA_IMMUTABLE");
      return;
    }

    if (found.kind === "other-user") throw new SyncRejection("SYNC_ID_CONFLICT");
    const values = putMedia.safeParse(op.opData ?? {});
    if (!values.success) throw new SyncRejection("SYNC_INVALID_OP");

    if (found.kind === "own") {
      if (found.row.deletedAt !== null) throw new SyncRejection("SYNC_ROW_DELETED");
      const same =
        found.row.kind === values.data.kind &&
        found.row.mime === values.data.mime &&
        found.row.width === values.data.width &&
        found.row.height === values.data.height &&
        found.row.bytes === values.data.bytes &&
        found.row.thumbBytes === values.data.thumb_bytes;
      if (!same) throw new SyncRejection("MEDIA_IMMUTABLE");
      return;
    }

    if (!newRowId.safeParse(id.data).success) throw new SyncRejection("SYNC_INVALID_OP");
    await db.insert(media).values({
      id: id.data,
      userId,
      kind: values.data.kind,
      mime: values.data.mime,
      width: values.data.width,
      height: values.data.height,
      bytes: values.data.bytes,
      thumbBytes: values.data.thumb_bytes,
    });
  },
  // The row stays as a tombstone marker (a late PUT must not resurrect it); its objects are
  // purged by `media.purge-objects` within a day, and the row goes with the account.
  async purgeTombstones() {
    return 0;
  },
};
