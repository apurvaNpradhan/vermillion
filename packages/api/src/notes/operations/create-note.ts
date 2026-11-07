import type { Database } from "@workspace/db";

import { notes } from "../tables";
import { toNote, type Note } from "./note";

export async function createNote(
  db: Database,
  userId: string,
  input: { title: string; body: string },
): Promise<Note> {
  const [row] = await db
    .insert(notes)
    .values({ userId, title: input.title, body: input.body })
    .returning();
  if (!row) throw new Error("Note insert returned no row");
  return toNote(row);
}
