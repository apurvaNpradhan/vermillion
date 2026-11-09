import { z } from "zod";

import type { ExerciseDatabase } from "./store";

/**
 * The thumbnail keys of live catalog exercises (not Custom, not retired), each once, in a stable
 * order. Retired catalog rows are not listed: no screen shows them, so no picture is fetched.
 */
export const CATALOG_THUMBNAIL_SQL = `SELECT DISTINCT thumbnail_key FROM exercise
  WHERE user_id IS NULL AND retired_at IS NULL AND thumbnail_key IS NOT NULL AND thumbnail_key <> ''
  ORDER BY thumbnail_key`;

const keysSchema = z.array(z.object({ thumbnail_key: z.string() }));

/**
 * Watches the live catalog's thumbnail keys; the handler runs with the full list on every change
 * to the `exercise` table. Returns the stop function; after it no handler runs.
 */
export function watchCatalogThumbnailKeys(
  database: ExerciseDatabase,
  handlers: { onKeys: (keys: string[]) => void; onError: (error: Error) => void },
): () => void {
  const controller = new AbortController();
  database.watchWithCallback(
    CATALOG_THUMBNAIL_SQL,
    [],
    {
      onResult: (result) => {
        if (controller.signal.aborted) return;
        const parsed = keysSchema.safeParse(result.array);
        if (!parsed.success) {
          handlers.onError(new Error("Local thumbnails could not be read"));
          return;
        }
        handlers.onKeys(parsed.data.map((row) => row.thumbnail_key));
      },
      onError: (error) => {
        if (!controller.signal.aborted) handlers.onError(error);
      },
    },
    { signal: controller.signal, tables: ["exercise"], throttleMs: 1000 },
  );
  return () => controller.abort();
}
