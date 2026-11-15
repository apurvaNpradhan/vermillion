import { commitAvatar } from "./commit-avatar";
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
  const { preferences, setUiAsync, refresh } = usePreferences();
  const local = useLocalData();
  const scope = useSyncValue((s) => s?.writeScope ?? "");
  const connected = useSyncValue(
    (s) => s !== null && s.indicator !== "paused" && s.phase.kind === "active",
  );
  const picker = usePickedMedia(async (db, image, writeScope) => {
    const id = await createMedia(db, { ...image, kind: "avatar" }, writeScope);
    try {
      // Preferences are online. Wait for the media metadata before sending its reference.
      const deadline = Date.now() + 15_000;
      while ((await db.getUploadQueueStats()).count > 0) {
        if (Date.now() >= deadline) throw new Error("Media upload timed out");
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    } catch (error) {
      await deleteMedia(db, id, writeScope).catch(() => undefined);
      throw error;
    }
    const confirmed = await commitAvatar(
      id,
      async () => {
        await setUiAsync({ avatarMediaId: id });
      },
      async () => (await refresh()).ui.avatarMediaId,
      async () => {
        await deleteMedia(db, id, writeScope);
      },
    );
    if (!confirmed) {
      toast.show({ variant: "danger", label: t("media__save_failed") });
      return null;
    }
    if (preferences.ui.avatarMediaId)
      await deleteMedia(db, preferences.ui.avatarMediaId, writeScope).catch(() => undefined);
    return preferences.ui.avatarMediaId;
  }, true);
  return {
    ...picker,
    pick: async (camera = false) => {
      if (!connected) {
        toast.show({ variant: "danger", label: t("media__avatar_online") });
        return;
      }
      await picker.pick(camera);
    },
    busy: picker.busy || removing,
    id: preferences.ui.avatarMediaId,
    remove: async () => {
      if (removing || picker.busy) return;
      if (!connected) {
        toast.show({ variant: "danger", label: t("media__avatar_online") });
        return;
      }
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
