import type { DbExecutor } from "@workspace/db";
import { and, eq, isNull } from "drizzle-orm";

import { notes } from "../tables";
import { toNote, type Note } from "./note";

/**
 * Changes only the given fields of one of the user's live notes; null when it is
 * not theirs or is deleted (a deleted note is never resurrected by an edit).
 */
export async function updateNote(
  db: DbExecutor,
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
    .where(and(eq(notes.id, id), eq(notes.userId, userId), isNull(notes.deletedAt)))
    .returning();
  return row ? toNote(row) : null;
}
