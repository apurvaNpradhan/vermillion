import { Button } from "@workspace/ui/components/button";

import { useTranslation } from "../i18n";
import { useOfflineUpdate } from "./use-offline-update";

/** Registers the offline shell and offers a new version; it never reloads the page on its own. */
export function OfflineUpdatePrompt() {
  const { t } = useTranslation();
  const { ready, waiting, apply, dismiss } = useOfflineUpdate();
  if (!ready) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-md flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-3 text-sm shadow-lg"
    >
      <span>{waiting ? t("offline__update_waiting") : t("offline__update_ready")}</span>
      <span className="flex gap-2">
        <Button size="sm" variant="ghost" onClick={dismiss} disabled={waiting}>
          {t("offline__update_later")}
        </Button>
        <Button size="sm" onClick={apply} disabled={waiting}>
          {t("offline__update_action")}
        </Button>
      </span>
    </div>
  );
}
