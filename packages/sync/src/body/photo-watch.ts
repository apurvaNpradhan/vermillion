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

/** Photos one page of the gallery reads; the screen asks for more as the reader scrolls. */
export const PHOTO_PAGE_SIZE = 90;
/** The most photos any one watch reads, whatever a caller asks for. */
const PHOTO_MAX_LIMIT = 5000;

const ORDER = "ORDER BY local_date DESC, julianday(taken_at) DESC, id DESC";

/** The SQL of the gallery: newest first, optionally of one pose, limited to a whole number. */
export function progressPhotosSql(byPose: boolean, limit: number) {
  const bounded = Math.min(Math.max(Math.trunc(limit), 1), PHOTO_MAX_LIMIT);
  return `SELECT * FROM progress_photo ${byPose ? "WHERE pose = ? " : ""}${ORDER} LIMIT ${bounded}`;
}

/**
 * Photos newest first, optionally of one pose, at most `limit` of them (the gallery pages by
 * raising it; ask for one more than shown to learn whether there is another page).
 */
export function watchProgressPhotos(
  db: AbstractPowerSyncDatabase,
  filter: { pose?: (typeof PROGRESS_POSES)[number] | null; limit: number },
  handlers: Handlers,
) {
  return filter.pose
    ? watch(db, progressPhotosSql(true, filter.limit), [filter.pose], handlers)
    : watch(db, progressPhotosSql(false, filter.limit), [], handlers);
}

const summaryRowSchema = z.array(
  z.object({
    pose: z.enum(PROGRESS_POSES),
    first_date: z.string(),
    last_date: z.string(),
    dates: z.number(),
  }),
);
/** What Compare knows of each pose, in one row per pose, however many photos there are. */
export type PoseSummary = { pose: (typeof PROGRESS_POSES)[number]; first: string; last: string; dates: number };

export const POSE_SUMMARY_SQL = `SELECT pose, MIN(local_date) AS first_date, MAX(local_date) AS last_date,
  COUNT(DISTINCT local_date) AS dates FROM progress_photo GROUP BY pose`;

export function parsePoseSummaries(rows: unknown): PoseSummary[] | null {
  const parsed = summaryRowSchema.safeParse(rows);
  return parsed.success
    ? parsed.data.map((row) => ({
        pose: row.pose,
        first: row.first_date,
        last: row.last_date,
        dates: row.dates,
      }))
    : null;
}

/**
 * The first date, the last date and the count of dates of every pose, from the table itself: the
 * earliest photo is never missing because a list was cut short (Compare's defaults come from here).
 */
export function watchPoseSummaries(
  db: AbstractPowerSyncDatabase,
  handlers: { onSummaries: (rows: PoseSummary[]) => void; onError: () => void },
) {
  const controller = new AbortController();
  db.watchWithCallback(
    POSE_SUMMARY_SQL,
    [],
    {
      onResult: (result) => {
        const parsed = parsePoseSummaries(result.array);
        if (parsed) handlers.onSummaries(parsed);
        else handlers.onError();
      },
      onError: handlers.onError,
    },
    { signal: controller.signal, tables: ["progress_photo"] },
  );
  return () => controller.abort();
}

/** The dates Compare offers for a pose, newest first; the first and last dates are always among them. */
export const POSE_DATES_LIMIT = 200;
export const POSE_DATES_SQL = `SELECT local_date FROM progress_photo WHERE pose = ?
  GROUP BY local_date ORDER BY local_date DESC LIMIT ${POSE_DATES_LIMIT}`;

const dateRowSchema = z.array(z.object({ local_date: z.string() }));

export function parsePoseDates(rows: unknown): string[] | null {
  const parsed = dateRowSchema.safeParse(rows);
  return parsed.success ? parsed.data.map((row) => row.local_date).sort() : null;
}

/** The dates (oldest first) a pose has photos on, at most `POSE_DATES_LIMIT` of the newest. */
export function watchPoseDates(
  db: AbstractPowerSyncDatabase,
  pose: (typeof PROGRESS_POSES)[number],
  handlers: { onDates: (dates: string[]) => void; onError: () => void },
) {
  const controller = new AbortController();
  db.watchWithCallback(
    POSE_DATES_SQL,
    [pose],
    {
      onResult: (result) => {
        const parsed = parsePoseDates(result.array);
        if (parsed) handlers.onDates(parsed);
        else handlers.onError();
      },
      onError: handlers.onError,
    },
    { signal: controller.signal, tables: ["progress_photo"] },
  );
  return () => controller.abort();
}

/** The photos of one pose on a few dates (Compare's two sides). */
export function watchPoseOnDates(
  db: AbstractPowerSyncDatabase,
  pose: (typeof PROGRESS_POSES)[number],
  dates: readonly string[],
  handlers: Handlers,
) {
  return watch(
    db,
    `SELECT * FROM progress_photo WHERE pose = ? AND local_date IN (SELECT value FROM json_each(?))
       ORDER BY local_date, julianday(taken_at), id LIMIT 24`,
    [pose, JSON.stringify(dates)],
    handlers,
  );
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
