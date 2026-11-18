import { WarningCircle } from "phosphor-react-native";
import { useTranslation } from "@/platform/i18n";
import { EmptyState } from "@/platform/ui/empty-state";
import { LibrarySetup } from "@/platform/ui/library-setup";

import { isFirstSync, type TrainStatus } from "./train-status";

/** List loading and recovery, without presenting a temporary empty result as an empty library. */
export function TrainingListState({
  status,
  onRetry,
}: {
  status: TrainStatus;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  if (status === "error") {
    return (
      <EmptyState
        icon={WarningCircle}
        title={t("training__load_failed")}
        action={{ label: t("training__retry"), onPress: onRetry }}
      />
    );
  }
  // A plan that is still reading from the device draws nothing; a fresh install says so once.
  if (isFirstSync(status)) return <LibrarySetup offline={status === "first-sync-offline"} />;
  return null;
}
