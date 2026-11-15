import { PROGRESS_POSES, type ProgressPose } from "@workspace/shared";
import {
  addProgressPhoto,
  deleteProgressPhoto,
  newMediaId,
  type WatchedPhoto,
} from "@workspace/sync";
import { useCallback, useState } from "react";

import { CameraDeniedError, pickImage, type ProcessedImage } from "@/media";
import { haptic } from "@/platform/haptics";
import { useTranslation } from "@/platform/i18n";
import { useAppToast } from "@/platform/ui/use-app-toast";
import { useLocalData, useSyncValue } from "@/sync";

/** A photo picked and processed, waiting for its Check-in to be saved. */
export type PendingPhotos = Partial<Record<ProgressPose, ProcessedImage>>;

/**
 * Picks, saves and deletes progress photos (ADR 0040, 0041). A photo is picked from the camera or
 * the library and re-encoded on the device (that drops EXIF, location included); saving hands both
 * files to the attachment queue, then writes the media row and the photo in one local transaction,
 * so it shows at once and uploads when there is a connection. Files first, row after.
 */
export function usePhotoActions() {
  const { t } = useTranslation();
  const { toast } = useAppToast();
  const local = useLocalData();
  const scope = useSyncValue((snapshot) => snapshot?.writeScope ?? "");
  const queue = local?.status === "ready" ? local.media : null;
  const [busy, setBusy] = useState(false);

  /** Resolves to the processed picture, or null when cancelled or when it failed (a toast says so). */
  const pick = useCallback(
    async (source: "camera" | "library"): Promise<ProcessedImage | null> => {
      try {
        return await pickImage({ square: false, source });
      } catch (error) {
        toast.show({
          variant: "danger",
          label: t(
            error instanceof CameraDeniedError ? "body__camera_denied" : "body__photo_failed",
          ),
        });
        return null;
      }
    },
    [toast, t],
  );

  /** Saves the pending photos of one Check-in; resolves to how many could not be saved. */
  const save = useCallback(
    async (pending: PendingPhotos, takenAt: string, localDate: string): Promise<number> => {
      if (local?.status !== "ready" || !queue) return Object.keys(pending).length;
      setBusy(true);
      let failed = 0;
      try {
        for (const pose of PROGRESS_POSES) {
          const image = pending[pose];
          if (!image) continue;
          const mediaId = newMediaId();
          try {
            await queue.addFiles(mediaId, { fullUri: image.fullUri, thumbUri: image.thumbUri });
            await addProgressPhoto(
              local.database,
              {
                pose,
                local_date: localDate,
                taken_at: takenAt,
                media: {
                  id: mediaId,
                  width: image.width,
                  height: image.height,
                  bytes: image.bytes,
                  thumbBytes: image.thumbBytes,
                },
              },
              scope,
            );
          } catch {
            failed += 1;
            await queue.discard(mediaId).catch(() => undefined);
          }
        }
        if (failed < Object.keys(pending).length) haptic.confirm();
        return failed;
      } finally {
        setBusy(false);
      }
    },
    [local, queue, scope],
  );

  /** Deletes a photo and its media, drops the device's files at once. */
  const remove = useCallback(
    async (photo: WatchedPhoto): Promise<boolean> => {
      if (local?.status !== "ready" || !queue) return false;
      try {
        const mediaId = await deleteProgressPhoto(local.database, photo.id, scope);
        if (mediaId !== null) await queue.discard(mediaId);
        haptic.confirm();
        toast.show({ label: t("body__photo_deleted") });
        return true;
      } catch {
        toast.show({ variant: "danger", label: t("errors__unknown") });
        return false;
      }
    },
    [local, queue, scope, toast, t],
  );

  return { busy, pick, save, remove };
}
