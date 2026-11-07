import { Link, useLocation } from "@tanstack/react-router";
import { Alert, AlertDescription } from "@workspace/ui/components/alert";
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

import { useSignOut } from "@/auth";
import { useTranslation } from "@/platform/i18n";

import { useSyncStatus } from "./use-sync-status";

/**
 * Minimal sync state for the signed-in app (phase 6 refines it): nothing while all is well; a
 * line when sign-in is needed, another account holds the device, or the app is too old.
 */
export function SyncBanner() {
  const { t } = useTranslation();
  const { snapshot, countUnsent, discardAndSwitch } = useSyncStatus();
  const href = useLocation({ select: (location) => location.href });
  const signOut = useSignOut();
  const [discardCount, setDiscardCount] = useState<number | null>(null);
  if (!snapshot) return null;

  if (snapshot.indicator === "update-required") {
    return (
      <Alert variant="warning" className="mb-4">
        <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
          <span>{t("sync__update_required")}</span>
          <Button size="sm" onClick={() => window.location.reload()}>
            {t("offline__update_action")}
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (snapshot.lockReason === "signed-out") {
    return (
      <Alert variant="warning" className="mb-4">
        <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
          <span>
            {t("sync__sign_in_to_sync")}
            {snapshot.pendingCount > 0
              ? ` ${t("sync__pending", { count: snapshot.pendingCount })}`
              : ""}
          </span>
          <Button size="sm" render={<Link to="/login" search={{ redirect: href }} />}>
            {t("sync__sign_in")}
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (snapshot.lockReason === "other-account") {
    return (
      <>
        <Alert variant="error" className="mb-4">
          <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
            <span>{t("sync__other_account")}</span>
            <span className="flex gap-2">
              <Button size="sm" onClick={() => signOut.mutate()}>
                {t("sync__switch_back")}
              </Button>
              <Button
                size="sm"
                variant="destructive-outline"
                onClick={() => void countUnsent().then(setDiscardCount)}
              >
                {t("sync__discard")}
              </Button>
            </span>
          </AlertDescription>
        </Alert>
        <AlertDialog
          open={discardCount !== null}
          onOpenChange={(open) => !open && setDiscardCount(null)}
        >
          <AlertDialogPopup>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("sync__discard_title")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("sync__discard_body", { count: discardCount ?? 0 })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogClose render={<Button variant="ghost" />}>
                {t("common__cancel")}
              </AlertDialogClose>
              <Button
                variant="destructive"
                onClick={() => void discardAndSwitch().finally(() => setDiscardCount(null))}
              >
                {t("sync__discard_confirm")}
              </Button>
            </AlertDialogFooter>
          </AlertDialogPopup>
        </AlertDialog>
      </>
    );
  }

  return null;
}
