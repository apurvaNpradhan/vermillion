import type { ProgressPose } from "@workspace/shared";

import type { ProcessedImage } from "@/media";

/** A photo picked and processed, waiting for its Check-in to be saved. */
export type PendingPhotos = Partial<Record<ProgressPose, ProcessedImage>>;

/**
 * The photos a Check-in sheet is holding, and the rule that none of them outlives the sheet: a
 * processed picture is a private photo sitting in the cache, so one that is replaced, removed or
 * abandoned (the sheet closed or dismissed without saving, a save that failed and was given up) is
 * deleted at once. `discard` is the file deletion; it is given in so this runs without a device.
 */
export function createPendingPhotos(discard: (image: ProcessedImage) => void) {
  let current: PendingPhotos = {};
  let disposed = false;
  const listeners = new Set<() => void>();
  const emit = () => {
    for (const listener of listeners) listener();
  };
  return {
    getSnapshot: () => current,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    /** Puts a photo in a slot; the one it replaces is deleted. After `dispose` it is deleted too. */
    set(pose: ProgressPose, image: ProcessedImage) {
      if (disposed) {
        discard(image);
        return;
      }
      const previous = current[pose];
      current = { ...current, [pose]: image };
      if (previous && previous !== image) discard(previous);
      emit();
    },
    /** Empties a slot, deleting its photo. */
    remove(pose: ProgressPose) {
      const previous = current[pose];
      if (!previous) return;
      const { [pose]: _removed, ...rest } = current;
      current = rest;
      discard(previous);
      emit();
    },
    /** The Check-in was saved: its files are in the attachment queue, so only forget them. */
    release() {
      current = {};
      emit();
    },
    /** The sheet is shown again (React may run an effect's cleanup and setup again at once). */
    reopen() {
      disposed = false;
    },
    /** The sheet is gone without a save: delete everything held, and anything that arrives late. */
    dispose() {
      disposed = true;
      const held = Object.values(current);
      current = {};
      for (const image of held) discard(image);
      emit();
    },
  };
}

export type PendingPhotoStore = ReturnType<typeof createPendingPhotos>;
