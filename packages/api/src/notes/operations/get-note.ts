import type { Database } from "@workspace/db";
import { and, eq } from "drizzle-orm";

import { notes } from "../tables";
import { toNote, type Note } from "./note";

/** One of the user's notes, or null when it does not exist or belongs to someone else. */
export async function getNote(db: Database, userId: string, id: string): Promise<Note | null> {
  const [row] = await db
    .select()
    .from(notes)
    .where(and(eq(notes.id, id), eq(notes.userId, userId)))
    .limit(1);
  return row ? toNote(row) : null;
}
