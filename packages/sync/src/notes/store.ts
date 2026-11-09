import type { AbstractPowerSyncDatabase } from "@powersync/common";
import { toCompilableQuery, wrapPowerSyncWithDrizzle } from "@powersync/drizzle-driver";
import { NOTE_BODY_MAX, NOTE_TITLE_MAX } from "@workspace/shared";
import { and, count, desc, eq, isNull, or, sql, type SQL } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";

import { DEVICE_OWNER_ID } from "../platform/device-owner";
import { drizzleSchema } from "../platform/schema";
import { deviceOwner, installMeta } from "../platform/tables";
import { notes } from "./tables";

/** Columns of `notes` the server accepts in an upload; the rest are written locally only. */
export const notesUploadColumns: ReadonlySet<string> = new Set(["title", "body"]);

export const NOTES_PAGE_SIZE = 50;
const LIST_THROTTLE_MS = 100;

// The caps live in `@workspace/shared`, shared with the server's zod schema and Postgres CHECKs.
export { NOTE_BODY_MAX, NOTE_TITLE_MAX };

/** The one definition of a writable note; `isValidNote`, `createNote` and `updateNote` use it. */
const titleSchema = z
  .string()
  .max(NOTE_TITLE_MAX)
  .refine((title) => title.trim() !== "");
const bodySchema = z.string().max(NOTE_BODY_MAX);
const noteValuesSchema = z.object({ title: titleSchema, body: bodySchema });

export type NoteValues = z.infer<typeof noteValuesSchema>;

/** Whether values may be written as a note; local writes mirror the server limits (ADR 0018). */
export function isValidNote(values: NoteValues): boolean {
  return noteValuesSchema.safeParse(values).success;
}

/**
 * A note as the screens see it. PowerSync's views do not enforce NOT NULL (a row from an older
 * build or a partial stream can hold NULLs), so the Drizzle row types are not proof: the rows are
 * parsed once here, at the read boundary.
 */
const localNoteSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type LocalNote = z.infer<typeof localNoteSchema>;

export type NotePatch = { title?: string; body?: string };

/** The PowerSync database the store runs on; Drizzle is layered on it, once per database. */
export type NotesDatabase = AbstractPowerSyncDatabase;

const clients = new WeakMap<NotesDatabase, ReturnType<typeof open>>();

function open(database: NotesDatabase) {
  return wrapPowerSyncWithDrizzle(database, { schema: drizzleSchema });
}

export function localNotes(database: NotesDatabase) {
  const existing = clients.get(database);
  if (existing) return existing;
  const created = open(database);
  clients.set(database, created);
  return created;
}

/** A Drizzle write transaction on the local database. */
export type NotesTx = Parameters<Parameters<ReturnType<typeof open>["transaction"]>[0]>[0];

export type NotesPage = { notes: LocalNote[]; hasMore: boolean };

const localNoteColumns = {
  id: notes.id,
  title: notes.title,
  body: notes.body,
  createdAt: notes.created_at,
  updatedAt: notes.updated_at,
};

/**
 * A `LIKE` pattern matching `search` anywhere, with `%`, `_` and the escape character taken
 * literally. SQLite's `LIKE` ignores ASCII case, so title and body match case-insensitively.
 */
function searchPattern(search: string): string {
  return `%${search.trim().replace(/[\\%_]/g, "\\$&")}%`;
}

function matchesSearch(search: string | undefined): SQL | undefined {
  if (search === undefined || search.trim() === "") return undefined;
  const pattern = searchPattern(search);
  return or(
    sql`${notes.title} LIKE ${pattern} ESCAPE '\\'`,
    sql`${notes.body} LIKE ${pattern} ESCAPE '\\'`,
  );
}

/**
 * The list query: newest first by `(updated_at, id)`, which `notes_live_updated_at_idx` serves.
 * A non-blank `search` keeps only notes whose title or body contains it.
 */
export function listNotesQuery(database: NotesDatabase, limit: number, search?: string) {
  return localNotes(database)
    .select(localNoteColumns)
    .from(notes)
    .where(and(isNull(notes.deleted_at), matchesSearch(search)))
    .orderBy(desc(notes.updated_at), desc(notes.id))
    .limit(limit);
}

/** Keys and compares list rows; `compareBy` covers every displayed field. */
const noteRowComparator = {
  keyBy: (note: LocalNote) => note.id,
  compareBy: (note: LocalNote) =>
    JSON.stringify([note.title, note.body, note.updatedAt, note.createdAt]),
};

/**
 * Bounded, live read: the newest `limit` notes by `(updated_at, id)` (the order the local index
 * serves), tombstones excluded. Asks for one extra row to know whether more exist. Differential:
 * the query re-runs on any write to `notes`, but a row that did not change keeps its object
 * reference across emissions, so memoised row components skip re-rendering. Returns the stop
 * function; after it no handler is called.
 */
export function watchNotes(
  database: NotesDatabase,
  limit: number,
  handlers: { onPage: (page: NotesPage) => void; onError: (error: Error) => void },
  search?: string,
): () => void {
  const drizzleQuery = listNotesQuery(database, limit + 1, search);
  const compilable = toCompilableQuery(drizzleQuery);
  const watched = database
    .customQuery<LocalNote>({
      compile: () => compilable.compile(),
      execute: async () => {
        // Parsed per run; the SDK's differential keeps the previous reference for equal rows.
        const parsed = z.array(localNoteSchema).safeParse(await drizzleQuery.execute());
        if (!parsed.success) throw new Error("Local notes could not be read");
        return parsed.data;
      },
    })
    .differentialWatch({
      rowComparator: noteRowComparator,
      triggerOnTables: ["notes"],
      reportFetching: false,
      // A sync burst writes many rows; re-read the list at most this often.
      throttleMs: LIST_THROTTLE_MS,
    });
  let stopped = false;
  let last: ReadonlyArray<LocalNote> | null = null;
  const removeListener = watched.registerListener({
    // `onData` does not fire for a first result equal to the empty placeholder, so an empty list
    // would stay "loading"; the state change fires once loading ends and on every new result.
    onStateChange: (state) => {
      if (stopped || state.isLoading || state.error !== null || state.data === last) return;
      last = state.data;
      handlers.onPage({ notes: state.data.slice(0, limit), hasMore: state.data.length > limit });
    },
    onError: (error) => {
      if (stopped) return;
      last = null;
      handlers.onError(error);
    },
  });
  return () => {
    stopped = true;
    removeListener();
    void watched.close();
  };
}

/** Watches how many live notes the device holds (tombstones excluded). */
export function watchNotesCount(
  database: NotesDatabase,
  handlers: { onCount: (total: number) => void; onError: (error: Error) => void },
): () => void {
  const controller = new AbortController();
  const db = localNotes(database);
  db.watch(
    db.select({ total: count() }).from(notes).where(isNull(notes.deleted_at)),
    {
      onResult: (rows) => handlers.onCount(rows[0]?.total ?? 0),
      onError: handlers.onError,
    },
    { signal: controller.signal, tables: ["notes"] },
  );
  return () => controller.abort();
}

/** Watches one live note: the row, or `null` once it is gone (deleted here or elsewhere). */
export function watchNote(
  database: NotesDatabase,
  id: string,
  handlers: { onNote: (note: LocalNote | null) => void; onError: (error: Error) => void },
): () => void {
  const controller = new AbortController();
  const db = localNotes(database);
  db.watch(
    db
      .select(localNoteColumns)
      .from(notes)
      .where(and(eq(notes.id, id), isNull(notes.deleted_at)))
      .limit(1),
    {
      onResult: (rows) => {
        const parsed = z.array(localNoteSchema).safeParse(rows);
        if (!parsed.success) {
          handlers.onError(new Error("Local note could not be read"));
          return;
        }
        handlers.onNote(parsed.data[0] ?? null);
      },
      onError: handlers.onError,
    },
    { signal: controller.signal, tables: ["notes"] },
  );
  return () => controller.abort();
}

/**
 * UI writers capture this identity before editing. Check under the same SQLite write lock as
 * the mutation, so a reset in another tab cannot transfer an old submission to the new owner.
 * Unscoped calls are for lower-level stores/tests; app hooks always supply their captured scope.
 */
export async function assertNotesWriteScope(
  tx: NotesTx,
  expectedInstallId?: string,
): Promise<void> {
  if (expectedInstallId === undefined) return;
  const [install] = await tx
    .select({ id: installMeta.id })
    .from(installMeta)
    .where(eq(installMeta.install_id, expectedInstallId))
    .limit(1);
  if (!install) throw new Error("The device account changed; reopen the form");
}

/** Inserts a note with a fresh UUIDv7 for the Device owner; shared by create and retry. */
export async function insertNote(tx: NotesTx, input: NoteValues): Promise<string> {
  const [owner] = await tx
    .select({ userId: deviceOwner.user_id })
    .from(deviceOwner)
    .where(eq(deviceOwner.id, DEVICE_OWNER_ID))
    .limit(1);
  if (!owner) throw new Error("No Device owner: sign in first");
  const id = uuidv7();
  const now = new Date().toISOString();
  await tx.insert(notes).values({
    id,
    user_id: owner.userId,
    title: input.title,
    body: input.body,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  });
  return id;
}

/** Creates a note locally with a client UUIDv7; it uploads as a PUT. */
export async function createNote(
  database: NotesDatabase,
  input: NoteValues,
  expectedInstallId?: string,
): Promise<string> {
  if (!isValidNote(input)) throw new Error("Note is empty or over the length limits");
  return localNotes(database).transaction(async (tx) => {
    await assertNotesWriteScope(tx, expectedInstallId);
    return insertNote(tx, input);
  });
}

/**
 * Changes only the fields in the patch that differ from the stored row. Callers pass the dirty
 * fields of a form (changed since edit start, see `draft.ts`), so a field the user did not touch
 * is never in the patch. Returns whether anything was written; false also when the note is gone.
 */
export async function patchNote(tx: NotesTx, id: string, patch: NotePatch): Promise<boolean> {
  const [current] = await tx
    .select({ title: notes.title, body: notes.body })
    .from(notes)
    .where(and(eq(notes.id, id), isNull(notes.deleted_at)))
    .limit(1);
  if (!current) return false;
  const changes: NotePatch = {
    ...(patch.title !== undefined && patch.title !== current.title ? { title: patch.title } : {}),
    ...(patch.body !== undefined && patch.body !== current.body ? { body: patch.body } : {}),
  };
  if (Object.keys(changes).length === 0) return false;
  await tx
    .update(notes)
    .set({ ...changes, updated_at: new Date().toISOString() })
    .where(eq(notes.id, id));
  return true;
}

export async function updateNote(
  database: NotesDatabase,
  id: string,
  patch: NotePatch,
  expectedInstallId?: string,
): Promise<boolean> {
  if (patch.title !== undefined && !titleSchema.safeParse(patch.title).success) {
    throw new Error("Title is empty or over the length limit");
  }
  if (patch.body !== undefined && !bodySchema.safeParse(patch.body).success) {
    throw new Error("Body is over the length limit");
  }
  return localNotes(database).transaction(async (tx) => {
    await assertNotesWriteScope(tx, expectedInstallId);
    return patchNote(tx, id, patch);
  });
}

/**
 * Deletes a note. Locally the row goes; the upload is a DELETE, which the server turns into a
 * tombstone (ADR 0019) and the stream then removes everywhere else.
 */
export async function deleteNote(
  database: NotesDatabase,
  id: string,
  expectedInstallId?: string,
): Promise<void> {
  await localNotes(database).transaction(async (tx) => {
    await assertNotesWriteScope(tx, expectedInstallId);
    await tx.delete(notes).where(eq(notes.id, id));
  });
}
