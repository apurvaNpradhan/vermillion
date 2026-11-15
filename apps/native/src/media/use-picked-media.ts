import { useRef, useState } from "react";
import { newMediaId, type MediaDatabase, type NewMedia } from "@workspace/sync";
import { useLocalData, useSyncValue } from "@/sync";
import { useTranslation } from "@/platform/i18n";
import { useAppToast } from "@/platform/ui/use-app-toast";
import { saveWithMedia } from "./save-with-media";
import { discardProcessed } from "./processed-files";
import { pickerErrorKey } from "./picker-error";
import { pickImage } from "./pick-image";

/** Files precede the transaction; a failed save removes the unreferenced files. */
export function usePickedMedia(
  save: (db: MediaDatabase, image: Omit<NewMedia, "kind">, scope: string) => Promise<string | null>,
  square: boolean,
) {
  const local = useLocalData();
  const scope = useSyncValue((s) => s?.writeScope ?? "");
  const { t } = useTranslation();
  const { toast } = useAppToast();
  const locked = useRef(false);
  const [busy, setBusy] = useState(false);
  const pick = async (camera = false) => {
    if (locked.current || local?.status !== "ready") return;
    locked.current = true;
    setBusy(true);

    try {
      const image = await pickImage({ square, source: camera ? "camera" : "library" });
      if (!image) return;
      const id = newMediaId();
      try {
        await saveWithMedia(local.media, image, id, async () => ({
          replaced: await save(
            local.database,
            {
              id,
              width: image.width,
              height: image.height,
              bytes: image.bytes,
              thumbBytes: image.thumbBytes,
            },
            scope,
          ),
        }));
      } finally {
        discardProcessed(image);
      }
    } catch (error) {
      toast.show({
        variant: "danger",
        label: t(error instanceof Error ? pickerErrorKey(error) : "media__save_failed"),
      });
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };
  return { pick, busy };
}
