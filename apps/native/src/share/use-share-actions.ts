import { useEffect, useState } from "react";
import type { View } from "react-native";

import { removeCachedFile } from "@/media";
import { haptic } from "@/platform/haptics";
import { useTranslation } from "@/platform/i18n";
import { useAppToast } from "@/platform/ui/use-app-toast";

import { pruneShareCache } from "./share-cache";
import { captureCard } from "./capture-card";
import { saveToPhotos, shareCard } from "./deliver-card";
import type { ImageGate } from "./image-gate";

export type ShareAction = "save" | "share";

/**
 * Save to Photos and Share…: capture the shown card, hand the file over, report what happened.
 * Only one runs at a time. Saved files are deleted at once. Shared files remain in the owned
 * cache for an hour, because a recipient can read them after the sheet or composer closes.
 */
export function useShareActions(gate: ImageGate) {
  const { t } = useTranslation();
  const { toast } = useAppToast();
  const [busy, setBusy] = useState<ShareAction | null>(null);
  const [denied, setDenied] = useState(false);
  useEffect(() => pruneShareCache(), []);

  const run = async (action: ShareAction, view: View | null, transparent: boolean) => {
    if (busy) return;
    setBusy(action);
    setDenied(false);
    try {
      const card = await captureCard(view, { transparent, gate });

      if (action === "save") {
        let result;
        try {
          result = await saveToPhotos(card);
        } finally {
          removeCachedFile(card.uri);
        }
        if (result === "denied") setDenied(true);
        else {
          haptic.success();
          toast.show({ label: t("share__saved") });
        }
      } else {
        await shareCard(card);
      }
    } catch {
      toast.show({
        variant: "danger",
        label: t(action === "save" ? "share__save_failed" : "share__share_failed"),
      });
    } finally {
      setBusy(null);
    }
  };

  return { busy, denied, save: run.bind(null, "save"), share: run.bind(null, "share") };
}
