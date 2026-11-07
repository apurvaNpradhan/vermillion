import type { DbExecutor } from "@workspace/db";
import { and, eq, isNull } from "drizzle-orm";

import { notes } from "../tables";
import { toNote, type Note } from "./note";

/** One of the user's live notes, or null when it does not exist, is deleted or belongs to someone else. */
export async function getNote(db: DbExecutor, userId: string, id: string): Promise<Note | null> {
  const [row] = await db
    .select()
    .from(notes)
    .where(and(eq(notes.id, id), eq(notes.userId, userId), isNull(notes.deletedAt)))
    .limit(1);
  return row ? toNote(row) : null;
}

/** Whether the user's own note is live, deleted (tombstone) or absent (never existed or purged). */
export async function noteState(
  db: DbExecutor,
  userId: string,
  id: string,
): Promise<"live" | "deleted" | "absent"> {
  const [row] = await db
    .select({ deletedAt: notes.deletedAt })
    .from(notes)
    .where(and(eq(notes.id, id), eq(notes.userId, userId)))
    .limit(1);
  if (!row) return "absent";
  return row.deletedAt ? "deleted" : "live";
}
