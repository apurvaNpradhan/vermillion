import { setProgramCover, setProgramCoverToNewMedia, newMediaId } from "@workspace/sync";
import { useAppToast } from "@/platform/ui/use-app-toast";
import { useCallback, useState } from "react";

import { pickImage, saveWithMedia } from "@/media";
import { haptic } from "@/platform/haptics";
import { useTranslation } from "@/platform/i18n";
import { useLocalData } from "@/sync";

import { useTrainingWrite } from "@/training/shared/use-training-write";

/**
 * Adds, replaces and removes the cover photo of one Program (ADR 0040). A picked photo is
 * re-encoded on the device, its files join the attachment queue, and the media row and the
 * Program's reference are written in one local transaction, so the cover shows at once, uploads
 * when there is a connection and reaches the other devices. The replaced cover's files go at once.
 * `pick` resolves to whether a photo was saved (false when cancelled); a failure shows a toast.
 */
export function useProgramCover(programId: string) {
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
      // Files first, row after. A write that fails (the toast is `write`'s) drops the new files;
      // one that committed keeps them even if the old cover's files cannot be removed.
      const saved = await saveWithMedia(
        queue,
        { fullUri: picked.fullUri, thumbUri: picked.thumbUri },
        id,
        () =>
          write(
            (db) =>
              setProgramCoverToNewMedia(
                db,
                programId,
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
  }, [queue, programId, write, writeScope, toast, t]);

  const remove = useCallback(
    () =>
      write(async (db) => {
        const replaced = await setProgramCover(db, programId, null, writeScope);
        // The removal committed; dropping the old files is best effort.
        if (replaced !== null) await queue?.discard(replaced).catch(() => undefined);
        haptic.confirm();
        return true;
      }, false),
    [programId, queue, write, writeScope],
  );

  return { pick, remove, busy };
}
