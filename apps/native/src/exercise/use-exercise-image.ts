import { useEffect, useRef, useState } from "react";
import { setExerciseImage } from "@workspace/sync";
import {
  createPendingImage,
  cloneProcessed,
  discardProcessed,
  pickImage,
  saveWithMedia,
  type ProcessedImage,
} from "@/media";
import { useLocalData, useSyncValue } from "@/sync";
import { newMediaId } from "@workspace/sync";
import { useAppToast } from "@/platform/ui/use-app-toast";
import { useTranslation } from "@/platform/i18n";
export function useExerciseImage() {
  const [picked, setPicked] = useState<Awaited<ReturnType<typeof pickImage>>>(null);
  const pending = useRef(createPendingImage<ProcessedImage>(discardProcessed)).current;
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    pending.reopen();
    return () => {
      mounted.current = false;
      pending.dispose();
    };
  }, [pending]);
  const replace = (image: ProcessedImage | null) => {
    pending.replace(image);
    setPicked(image);
  };
  const [removed, setRemoved] = useState(false);
  const [busy, setBusy] = useState(false);
  const local = useLocalData();
  const scope = useSyncValue((s) => s?.writeScope ?? "");
  const { toast } = useAppToast();
  const { t } = useTranslation();
  return {
    previewUri: picked?.thumbUri ?? null,
    dirty: picked !== null || removed,
    removed,
    busy,
    pick: async () => {
      setBusy(true);
      try {
        const image = await pickImage({ square: true });
        if (image) {
          if (!mounted.current) {
            discardProcessed(image);
            return;
          }
          replace(image);
          setRemoved(false);
        }
      } catch {
        toast.show({ variant: "danger", label: t("media__save_failed") });
      } finally {
        setBusy(false);
      }
    },
    remove: () => {
      replace(null);
      setRemoved(true);
    },
    save: async (id: string) => {
      if (!picked && !removed) return;
      if (local?.status !== "ready") throw new Error("Local storage unavailable");
      try {
        if (picked) {
          const mediaId = newMediaId();
          const copy = cloneProcessed(picked);
          try {
            await saveWithMedia(local.media, copy, mediaId, async () => ({
              replaced: await setExerciseImage(
                local.database,
                id,
                {
                  id: mediaId,
                  width: picked.width,
                  height: picked.height,
                  bytes: picked.bytes,
                  thumbBytes: picked.thumbBytes,
                },
                scope,
              ),
            }));
          } finally {
            discardProcessed(copy);
          }
        } else {
          const replaced = await setExerciseImage(local.database, id, null, scope);
          if (replaced) await local.media.discard(replaced).catch(() => undefined);
        }
        replace(null);
        setRemoved(false);
      } catch (error) {
        toast.show({ variant: "danger", label: t("media__save_failed") });
        throw error;
      }
    },
  };
}
