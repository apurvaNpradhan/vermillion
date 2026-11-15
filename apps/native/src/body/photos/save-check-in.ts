import { PROGRESS_POSES, type MeasurementInput, type ProgressPose } from "@workspace/shared";
import { newMediaId, saveCheckIn, type MediaDatabase, type NewProgressPhoto } from "@workspace/sync";

import type { MediaQueue, ProcessedImage } from "@/media";

import type { PendingPhotos } from "./pending-photos";

/** The file operations a save needs, so a test can run it without a device. */
export type CheckInFiles = {
  /** Copies a processed picture's files; the queue takes the copy, the original stays whole. */
  clone(image: ProcessedImage): ProcessedImage;
  /** Deletes a processed picture's files. */
  discard(image: ProcessedImage): void;
};

/**
 * Saves a Check-in with photos as one unit (ADR 0041). The photos' files are copied into the
 * attachment queue first (files first, row after: an upload waits until its row exists), then the
 * measurements, every media row and every photo are written in ONE local transaction. If anything
 * fails nothing is committed, the staged copies are dropped, and the pending photos are untouched,
 * so the sheet can stay open and Save can be tried again. Once it has committed the pending
 * pictures are deleted from the cache: they live in the queue now.
 *
 * Throws on failure; resolves to nothing on success.
 */
export async function saveCheckInWithPhotos(args: {
  database: MediaDatabase;
  queue: Pick<MediaQueue, "addFiles" | "discard">;
  files: CheckInFiles;
  scope: string;
  measurements: readonly MeasurementInput[];
  photos: PendingPhotos;
  takenAt: string;
  localDate: string;
}): Promise<void> {
  const staged: Array<{ mediaId: string; clone: ProcessedImage; original: ProcessedImage; pose: ProgressPose }> =
    [];
  const dropStaged = async () => {
    for (const item of staged) {
      await args.queue.discard(item.mediaId).catch(() => undefined);
      // The queue moves what it was given; a copy it never took is still ours to delete.
      args.files.discard(item.clone);
    }
  };
  try {
    for (const pose of PROGRESS_POSES) {
      const original = args.photos[pose];
      if (!original) continue;
      const mediaId = newMediaId();
      const clone = args.files.clone(original);
      staged.push({ mediaId, clone, original, pose });
      await args.queue.addFiles(mediaId, { fullUri: clone.fullUri, thumbUri: clone.thumbUri });
    }
    const photos: NewProgressPhoto[] = staged.map(({ mediaId, original, pose }) => ({
      pose,
      local_date: args.localDate,
      taken_at: args.takenAt,
      media: {
        id: mediaId,
        width: original.width,
        height: original.height,
        bytes: original.bytes,
        thumbBytes: original.thumbBytes,
      },
    }));
    await saveCheckIn(
      args.database,
      { measurements: args.measurements, photos },
      args.scope,
    );
  } catch (error) {
    await dropStaged();
    throw error;
  }
  for (const item of staged) args.files.discard(item.original);
}
