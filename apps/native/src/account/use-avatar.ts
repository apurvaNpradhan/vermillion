import { useState } from "react";
import { useTranslation } from "@/platform/i18n";
import { useAppToast } from "@/platform/ui/use-app-toast";
import { createMedia, deleteMedia } from "@workspace/sync";
import { usePickedMedia } from "@/media";
import { usePreferences } from "@/preferences";
import { useLocalData, useSyncValue } from "@/sync";

export function useAvatar() {
  const { t } = useTranslation();
  const { toast } = useAppToast();
  const [removing, setRemoving] = useState(false);
  const { preferences, setUiAsync } = usePreferences();
  const local = useLocalData();
  const scope = useSyncValue((s) => s?.writeScope ?? "");
  const picker = usePickedMedia(async (db, image, writeScope) => {
    const id = await createMedia(db, { ...image, kind: "avatar" }, writeScope);
    try {
      // Preferences are online. Wait for the media metadata before sending its reference.
      const deadline = Date.now() + 15_000;
      while ((await db.getUploadQueueStats()).count > 0) {
        if (Date.now() >= deadline) throw new Error("Media upload timed out");
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      await setUiAsync({ avatarMediaId: id });
      if (preferences.ui.avatarMediaId)
        await deleteMedia(db, preferences.ui.avatarMediaId, writeScope);
      return preferences.ui.avatarMediaId;
    } catch (error) {
      await deleteMedia(db, id, writeScope);
      throw error;
    }
  }, true);
  return {
    ...picker,
    busy: picker.busy || removing,
    id: preferences.ui.avatarMediaId,
    remove: async () => {
      if (removing || picker.busy) return;
      setRemoving(true);
      try {
        await setUiAsync({ avatarMediaId: null });
        if (local?.status === "ready" && preferences.ui.avatarMediaId) {
          await deleteMedia(local.database, preferences.ui.avatarMediaId, scope);
          await local.media.discard(preferences.ui.avatarMediaId);
        }
      } catch {
        toast.show({ variant: "danger", label: t("media__save_failed") });
      } finally {
        setRemoving(false);
      }
    },
  };
}
