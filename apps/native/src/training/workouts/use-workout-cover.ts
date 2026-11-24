import { setWorkoutCover, setWorkoutCoverToNewMedia, newMediaId } from "@workspace/sync";
import { useAppToast } from "@/platform/ui/use-app-toast";
import { useCallback, useState } from "react";

import { pickImage, saveWithMedia } from "@/media";
import { haptic } from "@/platform/haptics";
import { useTranslation } from "@/platform/i18n";
import { useLocalData } from "@/sync";

import { useTrainingWrite } from "@/training/shared/use-training-write";

/**
 * Adds, replaces and removes the cover photo of one Workout (ADR 0040), the same way as a
 * Program's: the picked photo is re-encoded on the device, its files join the attachment queue,
 * and the media row and the Workout's reference are written in one local transaction. A replaced
 * cover's files go at once unless a copy of the Workout still shows them.
 * `pick` resolves to whether a photo was saved (false when cancelled); a failure shows a toast.
 */
export function useWorkoutCover(workoutId: string) {
  const { t } = useTranslation();
  const { toast } = useAppToast();
  const local = useLocalData();
  const queue = local?.status === "ready" ? local.media : null;
  const { write, writeScope } = useTrainingWrite();
  const [busy, setBusy] = useState(false);

  const pick = useCallback(async () => {
    if (!queue) return false;
    setBusy(true);
    try {
      const picked = await pickImage({ square: true });
      if (picked === null) return false;
      const id = newMediaId();
      const saved = await saveWithMedia(
        queue,
        { fullUri: picked.fullUri, thumbUri: picked.thumbUri },
        id,
        () =>
          write(
            (db) =>
              setWorkoutCoverToNewMedia(
                db,
                workoutId,
                {
                  id,
                  width: picked.width,
                  height: picked.height,
                  bytes: picked.bytes,
                  thumbBytes: picked.thumbBytes,
                },
                writeScope,
              ),
            null,
          ),
      );
      if (saved) haptic.confirm();
      return saved;
    } catch {
      toast.show({ variant: "danger", label: t("training__cover_failed") });
      return false;
    } finally {
      setBusy(false);
    }
  }, [queue, workoutId, write, writeScope, toast, t]);

  const remove = useCallback(
    () =>
      write(async (db) => {
        const replaced = await setWorkoutCover(db, workoutId, null, writeScope);
        if (replaced !== null) await queue?.discard(replaced).catch(() => undefined);
        haptic.confirm();
        return true;
      }, false),
    [workoutId, queue, write, writeScope],
  );

  return { pick, remove, busy };
}
