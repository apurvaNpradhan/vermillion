import { useEffect, useRef, useState } from "react";
import type { View } from "react-native";

import { removeCachedFile } from "@/media";
import { haptic } from "@/platform/haptics";
import { useTranslation } from "@/platform/i18n";
import { useAppToast } from "@/platform/ui/use-app-toast";

import { captureCard } from "./capture-card";
import { saveToPhotos, shareCard } from "./deliver-card";
import type { ImageGate } from "./image-gate";

export type ShareAction = "save" | "share";

/**
 * Save to Photos and Share…: capture the shown card, hand the file over, report what happened.
 * Only one runs at a time. A saved file is deleted at once; a shared one stays until the next
 * capture or until the composer closes, because the receiving app may still be reading it when
 * the sheet returns.
 */
export function useShareActions(gate: ImageGate) {
  const { t } = useTranslation();
  const { toast } = useAppToast();
  const [busy, setBusy] = useState<ShareAction | null>(null);
  const [denied, setDenied] = useState(false);
  const file = useRef<string | null>(null);

  const discard = () => {
    if (file.current) removeCachedFile(file.current);
    file.current = null;
  };
  useEffect(() => discard, []);

  const run = async (action: ShareAction, view: View | null, transparent: boolean) => {
    if (busy) return;
    setBusy(action);
    setDenied(false);
    discard();
    try {
      const card = await captureCard(view, { transparent, gate });
      file.current = card.uri;
      if (action === "save") {
        const result = await saveToPhotos(card);
        if (result === "denied") setDenied(true);
        else {
          haptic.success();
          toast.show({ label: t("share__saved") });
        }
        discard();
      } else {
        await shareCard(card);
      }
    } catch {
      discard();
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
