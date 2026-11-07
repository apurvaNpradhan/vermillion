import type { AbstractPowerSyncDatabase, LockContext } from "@powersync/common";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";

import { readDeviceOwner } from "../platform/device-owner";

/** Columns of `notes` the server accepts in an upload; the rest are written locally only. */
export const notesUploadColumns: ReadonlySet<string> = new Set(["title", "body"]);

export const NOTES_PAGE_SIZE = 50;

/** Same caps as the server's zod schema and the Postgres CHECKs (UTF-16 length). */
export const NOTE_TITLE_MAX = 200;
export const NOTE_BODY_MAX = 10_000;

export type NoteValues = { title: string; body: string };

/** Whether values may be written as a note; local writes mirror the server limits (ADR 0018). */
export function isValidNote(values: NoteValues): boolean {
  return (
    values.title.trim() !== "" &&
    values.title.length <= NOTE_TITLE_MAX &&
    values.body.length <= NOTE_BODY_MAX
  );
}

/** What store functions need inside a write transaction. */
export type NotesTx = Pick<LockContext, "getOptional" | "execute">;

const noteRowSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

type NoteRow = z.infer<typeof noteRowSchema>;

/** A note as the screens see it. */
export type LocalNote = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
};

export type NotePatch = { title?: string; body?: string };

export type NotesDatabase = Pick<
  AbstractPowerSyncDatabase,
  "getOptional" | "watchWithCallback" | "writeTransaction"
>;

export type NotesPage = { notes: LocalNote[]; hasMore: boolean };

function toLocalNote(row: NoteRow): LocalNote {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Bounded, live read: the newest `limit` notes by `(updated_at, id)` (the order the local index
 * serves), tombstones excluded. Asks for one extra row to know whether more exist. Returns the
 * stop function.
 */
export function watchNotes(
  database: Pick<NotesDatabase, "watchWithCallback">,
  limit: number,
  handlers: { onPage: (page: NotesPage) => void; onError: (error: Error) => void },
): () => void {
  const controller = new AbortController();
  database.watchWithCallback(
    `SELECT id, title, body, created_at, updated_at FROM notes
     WHERE deleted_at IS NULL
     ORDER BY updated_at DESC, id DESC
     LIMIT ?`,
    [limit + 1],
    {
      onResult: (result) => {
        const parsed = z.array(noteRowSchema).safeParse(result.array);
        if (!parsed.success) {
          handlers.onError(new Error("Local notes could not be read"));
          return;
        }
        handlers.onPage({
          notes: parsed.data.slice(0, limit).map(toLocalNote),
          hasMore: parsed.data.length > limit,
        });
      },
      onError: handlers.onError,
    },
    { signal: controller.signal, tables: ["notes"] },
  );
  return () => controller.abort();
}

/** Watches one live note: the row, or `null` once it is gone (deleted here or elsewhere). */
export function watchNote(
  database: Pick<NotesDatabase, "watchWithCallback">,
  id: string,
  handlers: { onNote: (note: LocalNote | null) => void; onError: (error: Error) => void },
): () => void {
  const controller = new AbortController();
  database.watchWithCallback(
    `SELECT id, title, body, created_at, updated_at FROM notes
     WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
    [id],
    {
      onResult: (result) => {
        const parsed = z.array(noteRowSchema).safeParse(result.array);
        if (!parsed.success) {
          handlers.onError(new Error("Local note could not be read"));
          return;
        }
        const row = parsed.data[0];
        handlers.onNote(row ? toLocalNote(row) : null);
      },
      onError: handlers.onError,
    },
    { signal: controller.signal, tables: ["notes"] },
  );
  return () => controller.abort();
}

/** Inserts a note with a fresh UUIDv7 for the Device owner; shared by create and retry. */
export async function insertNote(tx: NotesTx, input: NoteValues): Promise<string> {
  const owner = await readDeviceOwner(tx);
  if (!owner) throw new Error("No Device owner: sign in first");
  const id = uuidv7();
  const now = new Date().toISOString();
  await tx.execute(
    `INSERT INTO notes (id, user_id, title, body, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL)`,
    [id, owner, input.title, input.body, now, now],
  );
  return id;
}

/** Creates a note locally with a client UUIDv7; it uploads as a PUT. */
export async function createNote(database: NotesDatabase, input: NoteValues): Promise<string> {
  if (!isValidNote(input)) throw new Error("Note is empty or over the length limits");
  return database.writeTransaction((tx) => insertNote(tx, input));
}

/**
 * Changes only the fields in the patch that differ from the stored row. Callers pass the dirty
 * fields of a form (changed since edit start, see `draft.ts`), so a field the user did not touch
 * is never in the patch. Returns whether anything was written; false also when the note is gone.
 */
export async function patchNote(tx: NotesTx, id: string, patch: NotePatch): Promise<boolean> {
  const current = await tx.getOptional<{ title: string; body: string }>(
    "SELECT title, body FROM notes WHERE id = ? AND deleted_at IS NULL",
    [id],
  );
  if (!current) return false;
  const changes = [
    ...(patch.title !== undefined && patch.title !== current.title
      ? [["title", patch.title] as const]
      : []),
    ...(patch.body !== undefined && patch.body !== current.body
      ? [["body", patch.body] as const]
      : []),
  ];
  if (changes.length === 0) return false;
  // Column names come from the literals above, never from input.
  const assignments = [...changes.map(([column]) => `${column} = ?`), "updated_at = ?"];
  await tx.execute(`UPDATE notes SET ${assignments.join(", ")} WHERE id = ?`, [
    ...changes.map(([, value]) => value),
    new Date().toISOString(),
    id,
  ]);
  return true;
}

export async function updateNote(
  database: NotesDatabase,
  id: string,
  patch: NotePatch,
): Promise<boolean> {
  if (patch.title !== undefined && !isValidNote({ title: patch.title, body: "" })) {
    throw new Error("Title is empty or over the length limit");
  }
  if (patch.body !== undefined && patch.body.length > NOTE_BODY_MAX) {
    throw new Error("Body is over the length limit");
  }
  return database.writeTransaction((tx) => patchNote(tx, id, patch));
}

/**
 * Deletes a note. Locally the row goes; the upload is a DELETE, which the server turns into a
 * tombstone (ADR 0019) and the stream then removes everywhere else.
 */
export async function deleteNote(database: NotesDatabase, id: string): Promise<void> {
  await database.writeTransaction((tx) => tx.execute("DELETE FROM notes WHERE id = ?", [id]));
}
