import { useMutation } from "@tanstack/react-query";
import { isNetworkError } from "@workspace/client/network-error";
import { errorCode } from "@workspace/client/orpc-error";
import { useCallback } from "react";
import { Share } from "react-native";

import { haptic } from "@/platform/haptics";
import { useTranslation } from "@/platform/i18n";
import { orpc } from "@/platform/orpc";
import { useAppToast } from "@/platform/ui/use-app-toast";
import { useLocalData } from "@/sync";

import { linkFor } from "./link-url";
import { linkKindOf, readSnapshot, type ShareTarget } from "./snapshot-source";

/** A link that exists: its code and the URL it opens. */
export type CreatedLink = { code: string; url: string };

/**
 * Makes a Share link for a Program, Workout or finished Session: reads the snapshot from the local
 * database, stores it on the server and returns the code and URL. A failure toasts the reason
 * (offline, too many links) and resolves to null, so a caller never has to catch.
 */
export function useCreateShareLink() {
  const { t } = useTranslation();
  const { toast } = useAppToast();
  const local = useLocalData();
  const database = local?.status === "ready" ? local.database : null;
  const mutation = useMutation(orpc.share.create.mutationOptions({ meta: { silent: true } }));
  const { mutateAsync } = mutation;

  const create = useCallback(
    async (target: ShareTarget, options: { weights: boolean }): Promise<CreatedLink | null> => {
      try {
        if (!database) throw new Error("Local storage is not available");
        const snapshot = await readSnapshot(database, target, options.weights);
        if (!snapshot) {
          toast.show({ variant: "danger", label: t("share__link_nothing") });
          return null;
        }
        const link = await mutateAsync({ snapshot });
        return { code: link.code, url: linkFor(linkKindOf(target), link.code) };
      } catch (error) {
        const failure = error instanceof Error ? error : null;
        const label = isNetworkError(failure)
          ? t("share__link_offline")
          : errorCode(failure) === "CONFLICT"
            ? t("share__link_limit")
            : t("share__link_failed");
        toast.show({ variant: "danger", label });
        return null;
      }
    },
    [database, mutateAsync, t, toast],
  );
  return { create, isPending: mutation.isPending };
}

/**
 * The "Share link" action of a Program or Workout: makes the link (weights are not shared) and
 * opens the system share sheet with it.
 */
export function useShareLinkAction() {
  const { t } = useTranslation();
  const { create, isPending } = useCreateShareLink();
  const shareLink = useCallback(
    async (target: ShareTarget) => {
      const link = await create(target, { weights: false });
      if (!link) return;
      haptic.confirm();
      await Share.share({ message: t("share__link_message", { url: link.url }) }).catch(
        () => undefined,
      );
    },
    [create, t],
  );
  return { shareLink, isPending };
}
