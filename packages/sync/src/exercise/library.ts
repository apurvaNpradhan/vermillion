import type { QueryResult } from "@powersync/common";
import { EQUIPMENT, MUSCLE_GROUPS } from "@workspace/shared";
import { z } from "zod";

import type { ExerciseDatabase } from "./store";
import {
  libraryCountQuery,
  libraryQuery,
  type LibraryFilters,
  type LibraryQuery,
} from "./library-query";

/** Rows the library asks for per window; scrolling to the end widens it by this much. */
export const LIBRARY_PAGE_SIZE = 100;

/** A re-read at most this often while a sync burst writes many rows. */
const THROTTLE_MS = 150;

const muscleGroupSchema = z.enum(MUSCLE_GROUPS);
const equipmentSchema = z.enum(EQUIPMENT);

const libraryRowSchema = z.object({
  id: z.string(),
  user_id: z.string().nullable(),
  title: z.string(),
  primary_muscle: muscleGroupSchema,
  equipment: equipmentSchema,
  thumbnail_key: z.string().nullable(),
  retired_at: z.string().nullable(),
});

/** One row of the list. `isCustom` is a Custom exercise of the signed-in user. */
export type LibraryRow = {
  id: string;
  title: string;
  primaryMuscle: z.infer<typeof muscleGroupSchema>;
  equipment: z.infer<typeof equipmentSchema>;
  thumbnailKey: string | null;
  isCustom: boolean;
  isArchived: boolean;
};

export type LibraryPage = { rows: LibraryRow[]; hasMore: boolean };

const countSchema = z.array(z.object({ total: z.number() })).min(1);

/**
 * Watches the library window for `filters`: the first `limit` rows in the filters' order (one
 * extra is read to know whether more exist). Returns the stop function; after it no handler runs.
 */
export function watchExerciseLibrary(
  database: ExerciseDatabase,
  filters: LibraryFilters,
  limit: number,
  handlers: { onPage: (page: LibraryPage) => void; onError: (error: Error) => void },
): () => void {
  const query = libraryQuery(filters, limit + 1);
  return watch(
    database,
    query,
    (rows) => {
      const parsed = z.array(libraryRowSchema).safeParse(rows);
      if (!parsed.success) {
        handlers.onError(new Error("Local exercises could not be read"));
        return;
      }
      handlers.onPage({
        rows: parsed.data.slice(0, limit).map((row) => ({
          id: row.id,
          title: row.title,
          primaryMuscle: row.primary_muscle,
          equipment: row.equipment,
          thumbnailKey: row.thumbnail_key,
          isCustom: row.user_id !== null,
          isArchived: row.retired_at !== null,
        })),
        hasMore: parsed.data.length > limit,
      });
    },
    handlers.onError,
  );
}

/** Watches how many exercises match `filters`, ignoring the window. */
export function watchExerciseLibraryCount(
  database: ExerciseDatabase,
  filters: LibraryFilters,
  handlers: { onCount: (total: number) => void; onError: (error: Error) => void },
): () => void {
  return watch(
    database,
    libraryCountQuery(filters),
    (rows) => {
      const parsed = countSchema.safeParse(rows);
      if (!parsed.success) {
        handlers.onError(new Error("Local exercises could not be counted"));
        return;
      }
      handlers.onCount(parsed.data[0]?.total ?? 0);
    },
    handlers.onError,
  );
}

function watch(
  database: ExerciseDatabase,
  query: LibraryQuery,
  onRows: (rows: QueryResult["array"]) => void,
  onError: (error: Error) => void,
): () => void {
  const controller = new AbortController();
  database.watchWithCallback(
    query.sql,
    query.params,
    {
      onResult: (result) => {
        if (!controller.signal.aborted) onRows(result.array);
      },
      onError: (error) => {
        if (!controller.signal.aborted) onError(error);
      },
    },
    { signal: controller.signal, tables: ["exercise"], throttleMs: THROTTLE_MS },
  );
  return () => controller.abort();
}
