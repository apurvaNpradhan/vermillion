import type { ProgressPose } from "../body";

/** What the selection helpers need of a progress photo row. */
export type PhotoLike = { id: string; pose: ProgressPose; local_date: string; taken_at: string };

const POSE_ORDER: Record<ProgressPose, number> = { front: 0, side: 1, back: 2 };
const DAY = 86400000;

/** Front, side, back, then the capture instant (a retake on the same day follows its first). */
function byPoseThenTime(a: PhotoLike, b: PhotoLike) {
  return (
    POSE_ORDER[a.pose] - POSE_ORDER[b.pose] ||
    Date.parse(a.taken_at) - Date.parse(b.taken_at) ||
    a.id.localeCompare(b.id)
  );
}

/** The photos of one pose, optionally; a pose of `null` keeps every pose. */
export function filterByPose<T extends PhotoLike>(photos: readonly T[], pose: ProgressPose | null) {
  return pose === null ? [...photos] : photos.filter((photo) => photo.pose === pose);
}

/**
 * Photos grouped by calendar date, newest day first. Inside a day they run front, side, back, so
 * the viewer's swipe within a day always goes in the same order.
 */
export function groupPhotosByDate<T extends PhotoLike>(photos: readonly T[]) {
  const days = new Map<string, T[]>();
  for (const photo of photos) {
    const day = days.get(photo.local_date) ?? [];
    day.push(photo);
    days.set(photo.local_date, day);
  }
  return [...days]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, items]) => ({ date, photos: items.sort(byPoseThenTime) }));
}

/** The dates a pose has a photo on, oldest first, each once. */
export function poseDates(photos: readonly PhotoLike[], pose: ProgressPose) {
  const dates = new Set(photos.flatMap((photo) => (photo.pose === pose ? [photo.local_date] : [])));
  return [...dates].sort();
}

/** The two dates of a comparison, earlier first; both null when there is nothing to compare. */
export type CompareDates = { before: string | null; after: string | null };

/**
 * The two dates Compare opens with: the first and the latest. With fewer than two dates there is
 * nothing to compare, so both are null; with exactly two they are those two.
 */
export function defaultCompareDates(dates: readonly string[]): CompareDates {
  const sorted = [...new Set(dates)].sort();
  const before = sorted[0];
  const after = sorted.at(-1);
  if (sorted.length < 2 || before === undefined || after === undefined) {
    return { before: null, after: null };
  }
  return { before, after };
}

/** The photo of a pose on a date; the last one taken when there is a retake. */
export function photoOnDate<T extends PhotoLike>(
  photos: readonly T[],
  pose: ProgressPose,
  date: string,
): T | null {
  const found = photos
    .filter((photo) => photo.pose === pose && photo.local_date === date)
    .sort(byPoseThenTime);
  return found.at(-1) ?? null;
}

/** The most recent photo: latest date, then latest capture instant. */
export function latestPhoto<T extends PhotoLike>(photos: readonly T[]): T | null {
  let best: T | null = null;
  for (const photo of photos) {
    if (
      best === null ||
      photo.local_date > best.local_date ||
      (photo.local_date === best.local_date &&
        Date.parse(photo.taken_at) >= Date.parse(best.taken_at))
    ) {
      best = photo;
    }
  }
  return best;
}

/** Whole calendar days from `date` to `today` (both `YYYY-MM-DD`); never negative. */
export function daysSince(date: string, today: string): number {
  return Math.max(
    0,
    Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / DAY),
  );
}

/**
 * The entry a Compare side shows for a date: the latest one made on that date or before it, so a
 * waist taken the day before the photo still counts. Null when nothing is that old.
 */
export function latestOnOrBefore<T extends { local_date: string; measured_at: string }>(
  entries: readonly T[],
  date: string,
): T | null {
  let best: T | null = null;
  for (const entry of entries) {
    if (entry.local_date > date) continue;
    if (
      best === null ||
      entry.local_date > best.local_date ||
      (entry.local_date === best.local_date &&
        Date.parse(entry.measured_at) >= Date.parse(best.measured_at))
    ) {
      best = entry;
    }
  }
  return best;
}
