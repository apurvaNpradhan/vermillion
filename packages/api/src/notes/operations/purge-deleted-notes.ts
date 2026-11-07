import type { DbExecutor } from "@workspace/db";
import { isNotNull, lt, and } from "drizzle-orm";

import { notes } from "../tables";

/** Hard-deletes notes soft-deleted before `olderThan`; returns how many went. */
export async function purgeDeletedNotes(db: DbExecutor, olderThan: Date): Promise<number> {
  const purged = await db
    .delete(notes)
    .where(and(isNotNull(notes.deletedAt), lt(notes.deletedAt, olderThan)))
    .returning({ id: notes.id });
  return purged.length;
}
