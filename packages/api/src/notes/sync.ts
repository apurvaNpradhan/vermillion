import { z } from "zod";

import { SyncRejection, type SyncTableHandler } from "../platform/sync/handler";
import { createNote } from "./operations/create-note";
import { deleteNote } from "./operations/delete-note";
import { noteState } from "./operations/get-note";
import { bodySchema, titleSchema } from "./operations/note";
import { purgeDeletedNotes } from "./operations/purge-deleted-notes";
import { updateNote } from "./operations/update-note";

const noteId = z.uuidv7();
// Strict: a column the server does not know (including `user_id`) is refused, not ignored.
const putData = z.strictObject({ title: titleSchema, body: bodySchema.default("") });
const patchData = z.strictObject({ title: titleSchema.optional(), body: bodySchema.optional() });

/**
 * Upload handler of the `notes` table (ADR 0018/0019): PUT creates (or replaces
 * the fields of one's own live note), PATCH changes only the sent fields, DELETE
 * is a soft delete. Delete wins over later edits; a purged row is never revived.
 */
export const notesSyncHandler: SyncTableHandler = {
  table: "notes",
  async apply(db, userId, op) {
    const id = noteId.safeParse(op.id);
    if (!id.success) throw new SyncRejection("SYNC_INVALID_OP");

    if (op.op === "DELETE") {
      // Idempotent: nothing to do for a missing, foreign or already deleted note.
      await deleteNote(db, userId, id.data);
      return;
    }

    if (op.op === "PUT") {
      const data = putData.safeParse(op.opData ?? {});
      if (!data.success) throw new SyncRejection("SYNC_INVALID_OP");
      const state = await noteState(db, userId, id.data);
      if (state === "deleted") throw new SyncRejection("SYNC_ROW_DELETED");
      if (state === "live") await updateNote(db, userId, id.data, data.data);
      // A duplicate id owned by someone else fails here with a unique violation.
      else await createNote(db, userId, { id: id.data, ...data.data });
      return;
    }

    const data = patchData.safeParse(op.opData ?? {});
    if (!data.success) throw new SyncRejection("SYNC_INVALID_OP");
    if (await updateNote(db, userId, id.data, data.data)) return;
    throw new SyncRejection(
      (await noteState(db, userId, id.data)) === "deleted"
        ? "SYNC_ROW_DELETED"
        : "SYNC_ROW_NOT_FOUND",
    );
  },
  purgeTombstones: purgeDeletedNotes,
};
