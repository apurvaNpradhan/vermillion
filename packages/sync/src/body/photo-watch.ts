import type { AbstractPowerSyncDatabase } from "@powersync/common";
import { PROGRESS_POSES } from "@workspace/shared";
import { z } from "zod";

const rowSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  media_id: z.string(),
  pose: z.enum(PROGRESS_POSES),
  taken_at: z.string(),
  local_date: z.string(),
  created_at: z.string(),
});
export type WatchedPhoto = z.infer<typeof rowSchema>;

type Handlers = { onPhotos: (rows: WatchedPhoto[]) => void; onError: () => void };

function watch(db: AbstractPowerSyncDatabase, sql: string, params: string[], handlers: Handlers) {
  const controller = new AbortController();
  db.watchWithCallback(
    sql,
    params,
    {
      onResult: (result) => {
        const parsed = z.array(rowSchema).safeParse(result.array);
        if (parsed.success) handlers.onPhotos(parsed.data);
        else handlers.onError();
      },
      onError: handlers.onError,
    },
    { signal: controller.signal, tables: ["progress_photo"] },
  );
  return () => controller.abort();
}

/** The most photos one watch reads: about three years of weekly Check-ins with every pose. */
export const PHOTO_WATCH_LIMIT = 500;

const ORDER = "ORDER BY local_date DESC, julianday(taken_at) DESC, id DESC";

/** Photos newest first, optionally of one pose. Always limited. */
export function watchProgressPhotos(
  db: AbstractPowerSyncDatabase,
  filter: { pose?: (typeof PROGRESS_POSES)[number] | null },
  handlers: Handlers,
) {
  return filter.pose
    ? watch(
        db,
        `SELECT * FROM progress_photo WHERE pose = ? ${ORDER} LIMIT ${PHOTO_WATCH_LIMIT}`,
        [filter.pose],
        handlers,
      )
    : watch(db, `SELECT * FROM progress_photo ${ORDER} LIMIT ${PHOTO_WATCH_LIMIT}`, [], handlers);
}

/** The photos of one calendar date, in pose order: what the viewer swipes through. */
export function watchPhotosOnDate(db: AbstractPowerSyncDatabase, date: string, handlers: Handlers) {
  return watch(
    db,
    `SELECT * FROM progress_photo WHERE local_date = ?
       ORDER BY CASE pose WHEN 'front' THEN 0 WHEN 'side' THEN 1 ELSE 2 END,
         julianday(taken_at), id LIMIT 12`,
    [date],
    handlers,
  );
}

/** The latest photo, if any (Home and the Measurements first tile). */
export function watchLatestProgressPhoto(db: AbstractPowerSyncDatabase, handlers: Handlers) {
  return watch(db, `SELECT * FROM progress_photo ${ORDER} LIMIT 1`, [], handlers);
}
