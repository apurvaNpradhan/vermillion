import type { DbExecutor } from "@workspace/db";

import { notes } from "../tables";
import { toNote, type Note } from "./note";

/**
 * Inserts a note. A client-generated `id` (UUIDv7, validated by the caller) is
 * kept; a duplicate id fails with a unique violation, whoever owns the row.
 */
export async function createNote(
  db: DbExecutor,
  userId: string,
  input: { id?: string | undefined; title: string; body: string },
): Promise<Note> {
  const [row] = await db
    .insert(notes)
    .values({
      ...(input.id ? { id: input.id } : {}),
      userId,
      title: input.title,
      body: input.body,
    })
    .returning();
  if (!row) throw new Error("Note insert returned no row");
  return toNote(row);
}
