import { useState } from "react";

import { useTranslation } from "@/platform/i18n";

import { useSyncStatus } from "./use-sync-status";

/**
 * Signing out with unsent changes asks first (ADR 0021). The changes stay on the device either
 * way and upload when the same account signs in again; the prompt says so.
 */
export function useSignOutConfirmation(signOut: () => void) {
  const { t } = useTranslation();
  const { countUnsent } = useSyncStatus();
  const [unsentCount, setUnsentCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);

  const requestSignOut = async () => {
    // If the queue cannot be read the user still gets to sign out; nothing is wiped either way.
    const count = await countUnsent().catch(() => 0);
    if (count === 0) {
      signOut();
      return;
    }
    setUnsentCount(count);
    setIsOpen(true);
  };

  return {
    requestSignOut,
    confirmationProps: {
      isOpen,
      onOpenChange: setIsOpen,
      title: t("sync__sign_out_title"),
      description: t("sync__sign_out_body", { count: unsentCount }),
      cancelLabel: t("common__cancel"),
      confirmLabel: t("nav__sign_out"),
      onConfirm: signOut,
    },
  };
}
