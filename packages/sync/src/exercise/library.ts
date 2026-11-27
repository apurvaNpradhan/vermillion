import type { QueryResult } from "@powersync/common";
import { EQUIPMENT, MUSCLE_GROUPS, type MuscleDetail } from "@workspace/shared";
import { z } from "zod";

import { parseMuscleDetails } from "./details";
import type { ExerciseDatabase } from "./store";
import {
  IS_PINNED_SQL,
  LIBRARY_ROW_COLUMNS,
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
  primary_detail: z.string().nullable().optional(),
  secondary_detail: z.string().nullable().optional(),
  equipment: equipmentSchema,
  thumbnail_key: z.string().nullable(),
  image_media_id: z.string().nullable().optional(),
  retired_at: z.string().nullable(),
  is_pinned: z.number(),
});

/** One row of the list. `isCustom` is a Custom exercise of the signed-in user. */
export type LibraryRow = {
  id: string;
  title: string;
  primaryMuscle: z.infer<typeof muscleGroupSchema>;
  primaryDetail: MuscleDetail[];
  secondaryDetail: MuscleDetail[];
  equipment: z.infer<typeof equipmentSchema>;
  thumbnailKey: string | null;
  imageMediaId?: string | null;
  isCustom: boolean;
  isArchived: boolean;
  isPinned: boolean;
};

function toLibraryRow(row: z.infer<typeof libraryRowSchema>): LibraryRow {
  return {
    id: row.id,
    title: row.title,
    primaryMuscle: row.primary_muscle,
    primaryDetail: parseMuscleDetails(row.primary_detail),
    secondaryDetail: parseMuscleDetails(row.secondary_detail),
    equipment: row.equipment,
    thumbnailKey: row.thumbnail_key,
    imageMediaId: row.image_media_id ?? null,
    isCustom: row.user_id !== null,
    isArchived: row.retired_at !== null,
    isPinned: row.is_pinned === 1,
  };
}

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
        rows: parsed.data.slice(0, limit).map(toLibraryRow),
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

/** How many recently trained exercises the Recent section lists. */
const RECENT_LIMIT = 10;

/**
 * The exercises of finished Sessions, most recently trained first, one row each. Archived
 * exercises are left out: they cannot be added to a workout any more.
 */
export const RECENT_QUERY: LibraryQuery = {
  sql: `SELECT ${LIBRARY_ROW_COLUMNS}, ${IS_PINNED_SQL} AS is_pinned FROM (
      SELECT se.exercise_id AS recent_id, MAX(s.started_at) AS last_at
      FROM session_exercise se
      JOIN training_session s ON s.id = se.session_id
      WHERE s.finished_at IS NOT NULL
      GROUP BY se.exercise_id
      ORDER BY last_at DESC, se.exercise_id DESC
      LIMIT ${RECENT_LIMIT}
    ) recent JOIN exercise ON exercise.id = recent.recent_id
    WHERE retired_at IS NULL
    ORDER BY last_at DESC, exercise.id DESC`,
  params: [],
};

/** Watches the user's most recently trained exercises (up to 10), most recent first. */
export function watchRecentExercises(
  database: ExerciseDatabase,
  handlers: { onRows: (rows: LibraryRow[]) => void; onError: (error: Error) => void },
): () => void {
  const controller = new AbortController();
  database.watchWithCallback(
    RECENT_QUERY.sql,
    RECENT_QUERY.params,
    {
      onResult: (result) => {
        if (controller.signal.aborted) return;
        const parsed = z.array(libraryRowSchema).safeParse(result.array);
        if (!parsed.success) {
          handlers.onError(new Error("Recent exercises could not be read"));
          return;
        }
        handlers.onRows(parsed.data.map(toLibraryRow));
      },
      onError: (error) => {
        if (!controller.signal.aborted) handlers.onError(error);
      },
    },
    {
      signal: controller.signal,
      tables: ["exercise", "exercise_pin", "session_exercise", "training_session"],
      throttleMs: THROTTLE_MS,
    },
  );
  return () => controller.abort();
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
    {
      signal: controller.signal,
      tables: ["exercise", "exercise_pin"],
      throttleMs: THROTTLE_MS,
    },
  );
  return () => controller.abort();
}
