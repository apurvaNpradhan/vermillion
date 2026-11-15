import { useRef, useState } from "react";
import { newMediaId, type MediaDatabase, type NewMedia } from "@workspace/sync";
import { useLocalData, useSyncValue } from "@/sync";
import { useTranslation } from "@/platform/i18n";
import { useAppToast } from "@/platform/ui/use-app-toast";
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
    let id: string | null = null;
    try {
      const image = await pickImage({ square, camera });
      if (!image) return;
      id = newMediaId();
      await local.media.addFiles(id, image);
      const replaced = await save(
        local.database,
        {
          id,
          width: image.width,
          height: image.height,
          bytes: image.bytes,
          thumbBytes: image.thumbBytes,
        },
        scope,
      );
      if (replaced) await local.media.discard(replaced);
    } catch {
      if (id) await local.media.discard(id).catch(() => undefined);
      toast.show({ variant: "danger", label: t("media__save_failed") });
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };
  return { pick, busy };
}
