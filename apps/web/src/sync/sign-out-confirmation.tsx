import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog";
import { Button } from "@workspace/ui/components/button";
import { useState } from "react";

import { useTranslation } from "@/platform/i18n";

import { useSyncStatus } from "./use-sync-status";

/**
 * Signing out with unsent changes asks first (ADR 0021). The changes stay on this device either
 * way and upload when the same account signs in again; the dialog says so.
 */
export function useSignOutConfirmation(signOut: () => void) {
  const { t } = useTranslation();
  const { countUnsent } = useSyncStatus();
  const [unsent, setUnsent] = useState<number | null>(null);

  const dialog = (
    <AlertDialog open={unsent !== null} onOpenChange={(open) => !open && setUnsent(null)}>
      <AlertDialogPopup>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("sync__sign_out_title")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("sync__sign_out_body", { count: unsent ?? 0 })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogClose render={<Button variant="ghost" />}>
            {t("common__cancel")}
          </AlertDialogClose>
          <Button
            onClick={() => {
              setUnsent(null);
              signOut();
            }}
          >
            {t("nav__sign_out")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogPopup>
    </AlertDialog>
  );

  return {
    dialog,
    request: async () => {
      const count = await countUnsent();
      if (count > 0) setUnsent(count);
      else signOut();
    },
  };
}
