import type { MeasurementInput } from "@workspace/shared";
import { deleteProgressPhoto, type WatchedPhoto } from "@workspace/sync";
import { useCallback, useState } from "react";

import {
  CameraDeniedError,
  cloneProcessed,
  discardProcessed,
  pickImage,
  type ProcessedImage,
} from "@/media";
import { haptic } from "@/platform/haptics";
import { useTranslation } from "@/platform/i18n";
import { useAppToast } from "@/platform/ui/use-app-toast";
import { useLocalData, useSyncValue } from "@/sync";

import type { PendingPhotos } from "./pending-photos";
import { saveCheckInWithPhotos } from "./save-check-in";

/**
 * Picks, saves and deletes progress photos (ADR 0040, 0041). A photo is picked from the camera or
 * the library and re-encoded on the device (that drops EXIF, location included); saving a Check-in
 * hands the files to the attachment queue, then writes the measurements, the media rows and the
 * photos in one local transaction, so they show at once and upload when there is a connection.
 * Files first, row after. A photo that is not kept is deleted (`createPendingPhotos`).
 */
export function usePhotoActions() {
  const { t } = useTranslation();
  const { toast } = useAppToast();
  const local = useLocalData();
  const scope = useSyncValue((snapshot) => snapshot?.writeScope ?? "");
  const queue = local?.status === "ready" ? local.media : null;
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

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

  /**
   * Saves a Check-in with photos: the measurements, the media and the photos in one transaction
   * (`saveCheckInWithPhotos`). Resolves to whether it was saved. On false nothing was written, the
   * pending pictures are untouched and `error` says so, so the sheet stays open for another try.
   */
  const saveCheckIn = useCallback(
    async (
      measurements: readonly MeasurementInput[],
      photos: PendingPhotos,
      takenAt: string,
      localDate: string,
    ): Promise<boolean> => {
      setSaveError(null);
      if (local?.status !== "ready" || !queue) {
        setSaveError(t("body__check_in_not_saved"));
        return false;
      }
      setBusy(true);
      try {
        await saveCheckInWithPhotos({
          database: local.database,
          queue,
          files: { clone: cloneProcessed, discard: discardProcessed },
          scope,
          measurements,
          photos,
          takenAt,
          localDate,
        });
        haptic.confirm();
        return true;
      } catch {
        setSaveError(t("body__check_in_not_saved"));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [local, queue, scope, t],
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

  return { busy, error: saveError, pick, saveCheckIn, remove };
}
