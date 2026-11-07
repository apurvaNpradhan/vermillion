import type { DbExecutor } from "@workspace/db";
import { and, eq, isNull } from "drizzle-orm";

import { notes } from "../tables";

/**
 * Soft-deletes one of the user's notes (ADR 0019: delete wins over later edits).
 * False when there is no live note of theirs; deleting twice is harmless.
 */
export async function deleteNote(db: DbExecutor, userId: string, id: string): Promise<boolean> {
  const now = new Date();
  const deleted = await db
    .update(notes)
    .set({ deletedAt: now, updatedAt: now })
    .where(and(eq(notes.id, id), eq(notes.userId, userId), isNull(notes.deletedAt)))
    .returning({ id: notes.id });
  return deleted.length > 0;
}
