import { z } from "zod";

import { readRejectedWrite, type RejectedWrite } from "../platform/rejected-writes";
import {
  insertNote,
  isValidNote,
  patchNote,
  type NotesDatabase,
  type NoteValues,
  type NotesTx,
} from "./store";

const payloadSchema = z.object({ title: z.string().optional(), body: z.string().optional() });

/**
 * The editable fields of a rejected note write, or null when the payload was truncated, is not
 * JSON, or the op carries nothing to edit (a DELETE).
 */
export function rejectedNoteFields(write: RejectedWrite): { title?: string; body?: string } | null {
  if (write.table !== "notes" || write.op === "DELETE" || write.truncated) return null;
  try {
    const parsed = payloadSchema.safeParse(JSON.parse(write.payload));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * What the retry form starts with: the rejected fields over the note as it is now (so a PATCH that
 * carried only `body` still shows the current title), over empty text for a note that is gone.
 */
export async function rejectedRetryValues(
  database: Pick<NotesDatabase, "getOptional">,
  write: RejectedWrite,
): Promise<NoteValues> {
  const current =
    write.op === "PUT"
      ? null
      : await database.getOptional<NoteValues>(
          "SELECT title, body FROM notes WHERE id = ? AND deleted_at IS NULL",
          [write.rowId],
        );
  const fields = rejectedNoteFields(write);
  return {
    title: fields?.title ?? current?.title ?? "",
    body: fields?.body ?? current?.body ?? "",
  };
}

export type RetryResult =
  /** A new local transaction was queued. */
  | "retried"
  /** The note no longer exists, so the edit was saved as a new note. */
  | "saved-as-new"
  /** The values break the length limits; nothing was changed. */
  | "invalid"
  /** The rejected write was already retried or discarded. */
  | "gone";

/**
 * Edit and retry: the reviewed values become a new validated local transaction, and the rejected
 * record is removed in the same write, so a crash cannot duplicate or lose the work.
 *
 * - PUT: the row never reached the server, so it is created again under a new id.
 * - PATCH: updates the note if it is still there, otherwise saves the values as a new note.
 * - DELETE: deletes the note again.
 */
export async function retryRejectedNote(
  database: NotesDatabase,
  id: string,
  values: NoteValues,
): Promise<RetryResult> {
  return database.writeTransaction(async (tx): Promise<RetryResult> => {
    const write = await readRejectedWrite(tx, id);
    if (!write) return "gone";
    let result: RetryResult = "retried";
    if (write.op === "DELETE") {
      await tx.execute("DELETE FROM notes WHERE id = ?", [write.rowId]);
    } else {
      if (!isValidNote(values)) return "invalid";
      result = await replay(tx, write, values);
    }
    await tx.execute("DELETE FROM rejected_writes WHERE id = ?", [id]);
    return result;
  });
}

async function replay(tx: NotesTx, write: RejectedWrite, values: NoteValues): Promise<RetryResult> {
  if (write.op === "PATCH") {
    const exists = await tx.getOptional(
      "SELECT id FROM notes WHERE id = ? AND deleted_at IS NULL",
      [write.rowId],
    );
    if (exists) {
      await patchNote(tx, write.rowId, values);
      return "retried";
    }
    await insertNote(tx, values);
    return "saved-as-new";
  }
  await insertNote(tx, values);
  return "retried";
}
