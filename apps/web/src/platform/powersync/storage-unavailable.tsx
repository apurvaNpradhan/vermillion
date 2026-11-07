import type { StorageUnavailableReason } from "@workspace/sync";
import { Alert, AlertDescription, AlertTitle } from "@workspace/ui/components/alert";
import { Button } from "@workspace/ui/components/button";

import { useTranslation } from "../i18n";

const REASON_KEY = {
  unsupported: "offline__storage_unsupported",
  denied: "offline__storage_denied",
  "open-failed": "offline__storage_open_failed",
} as const satisfies Record<StorageUnavailableReason, string>;

/** Shown instead of the app's data when durable local storage is missing. Never an in-memory fallback. */
export function StorageUnavailable({ reason }: { reason: StorageUnavailableReason }) {
  const { t } = useTranslation();
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-4">
      <Alert variant="error">
        <AlertTitle>{t("offline__storage_title")}</AlertTitle>
        <AlertDescription>{t(REASON_KEY[reason])}</AlertDescription>
      </Alert>
      <Button onClick={() => window.location.reload()}>{t("offline__storage_reload")}</Button>
    </main>
  );
}
