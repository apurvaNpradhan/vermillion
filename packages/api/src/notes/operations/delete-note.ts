import type { Database } from "@workspace/db";
import { and, eq } from "drizzle-orm";

import { notes } from "../tables";

/** Deletes one of the user's notes; false when it is not theirs. */
export async function deleteNote(db: Database, userId: string, id: string): Promise<boolean> {
  const deleted = await db
    .delete(notes)
    .where(and(eq(notes.id, id), eq(notes.userId, userId)))
    .returning({ id: notes.id });
  return deleted.length > 0;
}
