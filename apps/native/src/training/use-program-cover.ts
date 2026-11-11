import { clearProgramCover, setProgramCover } from "@workspace/sync";
import { useAppToast } from "@/platform/ui/use-app-toast";
import { useCallback, useState } from "react";

import { haptic } from "@/platform/haptics";
import { useTranslation } from "@/platform/i18n";
import { deleteCoverFile, storeCoverFile, versionedCoverUri } from "@/platform/media/cover-files";
import { pickCoverImage } from "@/platform/media/cover-pick";

import { useTrainingWrite } from "./use-training-write";

/**
 * Adds, replaces and removes the cover photo of one Program. The photo is a file on this device
 * and a row in a local-only table, so none of it syncs. `pick` resolves to whether a photo was
 * saved (false when cancelled); a failure shows a toast.
 */
export function useProgramCover(programId: string) {
  const { t } = useTranslation();
  const { toast } = useAppToast();
  const { write, writeScope } = useTrainingWrite();
  const [busy, setBusy] = useState(false);

  const pick = useCallback(async () => {
    setBusy(true);
    try {
      const picked = await pickCoverImage();
      if (picked === null) return false;
      const uri = versionedCoverUri(storeCoverFile(programId, picked));
      return await write(async (db) => {
        await setProgramCover(db, programId, uri, writeScope);
        haptic.confirm();
        return true;
      }, false);
    } catch {
      toast.show({ variant: "danger", label: t("training__cover_failed") });
      return false;
    } finally {
      setBusy(false);
    }
  }, [programId, write, writeScope, toast, t]);

  const remove = useCallback(
    () =>
      write(async (db) => {
        const uri = await clearProgramCover(db, programId, writeScope);
        if (uri !== null) deleteCoverFile(uri);
        haptic.confirm();
        return true;
      }, false),
    [programId, write, writeScope],
  );

  return { pick, remove, busy };
}
