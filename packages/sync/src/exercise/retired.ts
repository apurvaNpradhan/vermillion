import { z } from "zod";

import type { ExerciseDatabase } from "./store";

const idRow = z.object({ id: z.string() });

/** Which of `ids` are retired (archived) in the local database right now. Missing ids are not. */
export async function retiredExerciseIds(
  database: Pick<ExerciseDatabase, "getAll">,
  ids: readonly string[],
): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const marks = ids.map(() => "?").join(", ");
  const rows = await database.getAll(
    `SELECT id FROM exercise WHERE retired_at IS NOT NULL AND id IN (${marks})`,
    [...ids],
  );
  return new Set(
    z
      .array(idRow)
      .parse(rows)
      .map((row) => row.id),
  );
}
