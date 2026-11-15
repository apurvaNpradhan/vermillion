import { useAppToast } from "@/platform/ui/use-app-toast";
import { useTranslation } from "@/platform/i18n";
import { useCallback } from "react";
import {
  addSessionPhoto,
  removeSessionPhoto,
  watchSessionPhotos,
  type SessionPhoto,
  type MediaDatabase,
} from "@workspace/sync";
import { usePickedMedia } from "@/media";
import { useLocalWatch } from "@/platform/local-watch/use-local-watch";
import { useLocalData, useSyncValue } from "@/sync";
export function useSessionPhotos(id: string) {
  const { t } = useTranslation();
  const { toast } = useAppToast();
  const subscribe = useCallback(
    (db: MediaDatabase, onValue: (photos: SessionPhoto[]) => void, onError: () => void) =>
      watchSessionPhotos(db, id, onValue, onError),
    [id],
  );
  const state = useLocalWatch(subscribe);
  const local = useLocalData();
  const scope = useSyncValue((s) => s?.writeScope ?? "");
  const picker = usePickedMedia(async (db, image, scope) => {
    await addSessionPhoto(db, id, image, scope);
    return null;
  }, false);
  return {
    ...state,
    ...picker,
    photos: state.value ?? [],
    remove: async (photoId: string) => {
      if (local?.status !== "ready") return;
      try {
        const removed = await removeSessionPhoto(local.database, photoId, scope);
        if (removed) await local.media.discard(removed);
      } catch {
        toast.show({ variant: "danger", label: t("media__save_failed") });
      }
    },
  };
}
