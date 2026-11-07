import type { Database } from "@workspace/db";
import { and, eq } from "drizzle-orm";

import { notes } from "../tables";
import { toNote, type Note } from "./note";

/** Changes the given fields of one of the user's notes; null when it is not theirs. */
export async function updateNote(
  db: Database,
  userId: string,
  id: string,
  patch: { title?: string | undefined; body?: string | undefined },
): Promise<Note | null> {
  const [row] = await db
    .update(notes)
    .set({
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.body !== undefined ? { body: patch.body } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(notes.id, id), eq(notes.userId, userId)))
    .returning();
  return row ? toNote(row) : null;
}
