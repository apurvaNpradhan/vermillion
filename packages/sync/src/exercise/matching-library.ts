import type { AbstractPowerSyncDatabase } from "@powersync/common";
import { EXERCISE_TYPES, type LibraryEntry } from "@workspace/shared";
import { z } from "zod";

const PAGE = 1000;

const row = z.object({
  id: z.string(),
  title: z.string(),
  aka: z.string().nullable(),
  user_id: z.string().nullable(),
  exercise_type: z.enum(EXERCISE_TYPES),
});

/**
 * Every exercise a history import may match a name to: the catalog and the user's own, archived
 * ones left out. Read in pages by id.
 */
export async function readMatchingLibrary(
  database: AbstractPowerSyncDatabase,
): Promise<LibraryEntry[]> {
  const entries: LibraryEntry[] = [];
  let after = "";
  for (;;) {
    const result = await database.getAll(
      `SELECT id, title, aka, user_id, exercise_type FROM exercise
       WHERE retired_at IS NULL AND id > ? ORDER BY id LIMIT ?`,
      [after, PAGE],
    );
    const rows = z.array(row).parse(result);
    for (const item of rows) {
      entries.push({
        id: item.id,
        title: item.title,
        aka: item.aka,
        custom: item.user_id !== null,
        exerciseType: item.exercise_type,
      });
    }
    const last = rows.at(-1);
    if (rows.length < PAGE || !last) return entries;
    after = last.id;
  }
}
