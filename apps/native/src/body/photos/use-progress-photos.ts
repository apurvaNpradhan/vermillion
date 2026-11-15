import type { ProgressPose } from "@workspace/shared";
import {
  PHOTO_PAGE_SIZE,
  watchPoseSummaries,
  watchPoseDates,
  watchPoseOnDates,
  type PoseSummary,
  watchLatestProgressPhoto,
  watchProgressPhotos,
  type TrainingDatabase,
  type WatchedPhoto,
} from "@workspace/sync";
import { useCallback, useRef } from "react";

import { useLocalWatch } from "@/platform/local-watch/use-local-watch";

const NONE: WatchedPhoto[] = [];

/** Progress photos, newest first, optionally of one pose (`null` is every pose). */
export function useProgressPhotos(pose: ProgressPose | null) {
  const more = useRef<() => void>(() => undefined);
  const subscribe = useCallback(
    (db: TrainingDatabase, onValue: (rows: WatchedPhoto[]) => void, onError: () => void) => {
      let limit = PHOTO_PAGE_SIZE;
      let hasMore = false;
      let loading = false;
      let stop: () => void = () => undefined;
      const open = () => {
        loading = true;
        stop();
        stop = watchProgressPhotos(
          db,
          { pose, limit: limit + 1 },
          {
            onPhotos: (rows) => {
              loading = false;
              hasMore = rows.length > limit;
              onValue(rows.slice(0, limit));
            },
            onError,
          },
        );
      };
      more.current = () => {
        if (loading || !hasMore) return;
        limit += PHOTO_PAGE_SIZE;
        open();
      };
      open();
      return () => {
        more.current = () => undefined;
        stop();
      };
    },
    [pose],
  );
  const state = useLocalWatch(subscribe);
  return { ...state, photos: state.value ?? NONE, loadMore: useCallback(() => more.current(), []) };
}

const subscribeLatest = (
  db: TrainingDatabase,
  onValue: (rows: WatchedPhoto[]) => void,
  onError: () => void,
) => watchLatestProgressPhoto(db, { onPhotos: onValue, onError });

/** The latest progress photo, or null; for Home and the Measurements first tile. */
export function useLatestProgressPhoto() {
  const state = useLocalWatch(subscribeLatest);
  return { ...state, photo: state.value?.[0] ?? null };
}

export function useComparePhotos(pose: ProgressPose, before: string | null, after: string | null) {
  const subscribe = useCallback(
    (db: TrainingDatabase, onValue: (rows: WatchedPhoto[]) => void, onError: () => void) =>
      watchPoseOnDates(
        db,
        pose,
        [before, after].flatMap((date) => (date ? [date] : [])),
        { onPhotos: onValue, onError },
      ),
    [pose, before, after],
  );
  const state = useLocalWatch(subscribe);
  return { ...state, photos: state.value ?? NONE };
}
export function usePoseDates(pose: ProgressPose) {
  const subscribe = useCallback(
    (db: TrainingDatabase, onValue: (dates: string[]) => void, onError: () => void) =>
      watchPoseDates(db, pose, { onDates: onValue, onError }),
    [pose],
  );
  return useLocalWatch(subscribe).value ?? [];
}
const subscribeSummaries = (
  db: TrainingDatabase,
  onValue: (rows: PoseSummary[]) => void,
  onError: () => void,
) => watchPoseSummaries(db, { onSummaries: onValue, onError });
export function usePoseSummaries() {
  return useLocalWatch(subscribeSummaries);
}
