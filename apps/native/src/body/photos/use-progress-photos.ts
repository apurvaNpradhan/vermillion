import type { ProgressPose } from "@workspace/shared";
import {
  watchLatestProgressPhoto,
  watchProgressPhotos,
  type TrainingDatabase,
  type WatchedPhoto,
} from "@workspace/sync";
import { useCallback } from "react";

import { useLocalWatch } from "@/platform/local-watch/use-local-watch";

const NONE: WatchedPhoto[] = [];

/** Progress photos, newest first, optionally of one pose (`null` is every pose). */
export function useProgressPhotos(pose: ProgressPose | null) {
  const subscribe = useCallback(
    (db: TrainingDatabase, onValue: (rows: WatchedPhoto[]) => void, onError: () => void) =>
      watchProgressPhotos(db, { pose }, { onPhotos: onValue, onError }),
    [pose],
  );
  const state = useLocalWatch(subscribe);
  return { ...state, photos: state.value ?? NONE };
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
