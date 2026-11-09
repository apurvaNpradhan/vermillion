import type { DbExecutor } from "@workspace/db";
import { isNotNull, lt, and } from "drizzle-orm";

import { deletedNoteIds, notes } from "../tables";

/** Hard-deletes notes soft-deleted before `olderThan`; returns how many went. */
export async function purgeDeletedNotes(db: DbExecutor, olderThan: Date): Promise<number> {
  return db.transaction(async (tx) => {
    const purged = await tx
      .delete(notes)
      .where(and(isNotNull(notes.deletedAt), lt(notes.deletedAt, olderThan)))
      .returning({ id: notes.id, userId: notes.userId });
    // Atomic with deletion: a late PUT must never observe neither tombstone nor marker.
    // Bound parameter counts even when a daily purge catches a large backlog.
    for (let offset = 0; offset < purged.length; offset += 1000) {
      await tx
        .insert(deletedNoteIds)
        .values(purged.slice(offset, offset + 1000))
        .onConflictDoNothing();
    }
    return purged.length;
  });
}
