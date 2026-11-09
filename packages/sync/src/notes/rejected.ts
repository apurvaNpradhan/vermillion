import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { parseRejectedWrite, type RejectedWrite } from "../platform/rejected-writes";
import { rejectedWrites } from "../platform/tables";
import {
  assertNotesWriteScope,
  insertNote,
  isValidNote,
  localNotes,
  patchNote,
  type NotesDatabase,
  type NoteValues,
  type NotesTx,
} from "./store";
import { notes } from "./tables";

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
  database: NotesDatabase,
  write: RejectedWrite,
): Promise<NoteValues> {
  const [current] =
    write.op === "PUT"
      ? []
      : await localNotes(database)
          .select({ title: notes.title, body: notes.body })
          .from(notes)
          .where(and(eq(notes.id, write.rowId), isNull(notes.deleted_at)))
          .limit(1);
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
  baseline: NoteValues = values,
  expectedInstallId?: string,
): Promise<RetryResult> {
  return localNotes(database).transaction(async (tx): Promise<RetryResult> => {
    await assertNotesWriteScope(tx, expectedInstallId);
    const [row] = await tx.select().from(rejectedWrites).where(eq(rejectedWrites.id, id)).limit(1);
    if (!row) return "gone";
    const write = parseRejectedWrite(row);
    let result: RetryResult = "retried";
    if (write.op === "DELETE") {
      await tx.delete(notes).where(eq(notes.id, write.rowId));
    } else {
      if (!isValidNote(values)) return "invalid";
      result = await replay(tx, write, values, baseline);
    }
    await tx.delete(rejectedWrites).where(eq(rejectedWrites.id, id));
    return result;
  });
}

async function replay(
  tx: NotesTx,
  write: RejectedWrite,
  values: NoteValues,
  baseline: NoteValues,
): Promise<RetryResult> {
  if (write.op === "PATCH") {
    const [exists] = await tx
      .select({ id: notes.id })
      .from(notes)
      .where(and(eq(notes.id, write.rowId), isNull(notes.deleted_at)))
      .limit(1);
    if (exists) {
      const rejected = rejectedNoteFields(write);
      // Preserve the original intent, plus fields edited in this retry form. A field only
      // displayed as context must not overwrite a newer value replicated while it was open.
      await patchNote(tx, write.rowId, {
        ...(rejected?.title !== undefined || values.title !== baseline.title
          ? { title: values.title }
          : {}),
        ...(rejected?.body !== undefined || values.body !== baseline.body
          ? { body: values.body }
          : {}),
      });
      return "retried";
    }
    await insertNote(tx, values);
    return "saved-as-new";
  }
  await insertNote(tx, values);
  return "retried";
}
