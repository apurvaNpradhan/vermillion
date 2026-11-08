import { useTranslation } from "@/platform/i18n";

import { useSyncStatus } from "./use-sync-status";

/**
 * One line of sync state for a list: waiting changes, uploading, offline, or all synced. Locked
 * and update-required states are the banner's job, so this renders nothing for them.
 */
export function SyncStatusLine() {
  const { t } = useTranslation();
  const { snapshot } = useSyncStatus();
  if (!snapshot || snapshot.indicator === "locked" || snapshot.indicator === "update-required") {
    return null;
  }

  const pending =
    snapshot.pendingCount > 0 ? t("sync__pending", { count: snapshot.pendingCount }) : null;
  const text =
    snapshot.indicator === "paused"
      ? [t("sync__state_paused"), pending].filter(Boolean).join(" ")
      : snapshot.indicator === "uploading"
        ? (pending ?? t("sync__state_uploading"))
        : t("sync__state_synced");

  return (
    <p role="status" className="text-body text-muted-foreground" data-testid="sync-status">
      {text}
    </p>
  );
}
