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

export type ShareAction = "save" | "save-all" | "share";

/** One card to capture: its frame and whether it keeps its transparency. */
export type CardTarget = { view: View | null; transparent: boolean };

/**
 * A failed capture or delivery, written to the device log. The toast only says that it failed;
 * this line is the one place the cause is kept, in release builds too.
 */
function report(action: ShareAction, message: string) {
  console.warn(`[share] ${action} failed: ${message}`);
}

/**
 * Save to Photos, Save all and Share…: capture the shown card (or every card), hand the files
 * over, report what happened. Only one runs at a time. Saved files are deleted at once. Shared
 * files remain in the owned cache for an hour, because a recipient can read them after the sheet
 * or composer closes.
 */
export function useShareActions(gate: ImageGate) {
  const { t } = useTranslation();
  const { toast } = useAppToast();
  const [busy, setBusy] = useState<ShareAction | null>(null);
  const [denied, setDenied] = useState(false);
  useEffect(() => pruneShareCache(), []);

  /** Captures and saves one card; the capture never outlives the save. */
  const saveOne = async ({ view, transparent }: CardTarget) => {
    const card = await captureCard(view, { transparent, gate });
    try {
      return await saveToPhotos(card);
    } finally {
      removeCachedFile(card.uri);
    }
  };

  const run = async (action: ShareAction, targets: readonly CardTarget[]) => {
    if (busy || targets.length === 0) return;
    setBusy(action);
    setDenied(false);
    try {
      if (action === "share") {
        const [target] = targets;
        if (target) await shareCard(await captureCard(target.view, { ...target, gate }));
        return;
      }
      for (const target of targets) {
        if ((await saveOne(target)) === "denied") {
          setDenied(true);
          return;
        }
      }
      haptic.success();
      toast.show({
        label: action === "save" ? t("share__saved") : t("share__every_card_saved"),
      });
    } catch (error) {
      report(action, error instanceof Error ? error.message : String(error));
      toast.show({
        variant: "danger",
        label: t(action === "share" ? "share__share_failed" : "share__save_failed"),
      });
    } finally {
      setBusy(null);
    }
  };

  return {
    busy,
    denied,
    save: (target: CardTarget) => run("save", [target]),
    saveAll: (targets: readonly CardTarget[]) => run("save-all", targets),
    share: (target: CardTarget) => run("share", [target]),
  };
}
