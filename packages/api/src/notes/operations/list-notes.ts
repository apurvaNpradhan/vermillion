import type { Database } from "@workspace/db";
import { desc, eq } from "drizzle-orm";

import { notes } from "../tables";
import { toNote, type Note } from "./note";

/** The user's notes, most recently updated first. */
export async function listNotes(db: Database, userId: string): Promise<Note[]> {
  const rows = await db
    .select()
    .from(notes)
    .where(eq(notes.userId, userId))
    .orderBy(desc(notes.updatedAt), desc(notes.id));
  return rows.map(toNote);
}
