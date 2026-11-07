import type { DbExecutor } from "@workspace/db";
import { and, desc, eq, isNull } from "drizzle-orm";

import { notes } from "../tables";
import { toNote, type Note } from "./note";

/** The user's live notes, most recently updated first. */
export async function listNotes(db: DbExecutor, userId: string): Promise<Note[]> {
  const rows = await db
    .select()
    .from(notes)
    .where(and(eq(notes.userId, userId), isNull(notes.deletedAt)))
    .orderBy(desc(notes.updatedAt), desc(notes.id));
  return rows.map(toNote);
}
