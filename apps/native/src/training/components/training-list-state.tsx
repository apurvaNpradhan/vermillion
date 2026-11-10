import { WarningCircle } from "phosphor-react-native";
import { Text, View } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { EmptyState } from "@/platform/ui/empty-state";
import { Skeleton } from "@/platform/ui/skeleton";

import type { TrainStatus } from "../train-status";

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
  if (status !== "loading" && status !== "first-sync") return null;
  return (
    <View
      className="gap-3"
      accessibilityLabel={t("common__loading")}
      accessibilityRole="progressbar"
    >
      {Array.from({ length: 3 }, (_, index) => (
        <View key={index} className="gap-3 rounded-2xl border border-border bg-surface p-4">
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-4 w-2/3" />
        </View>
      ))}
      {status === "first-sync" ? (
        <Text accessibilityLiveRegion="polite" className="text-center text-body text-muted">
          {t("training__first_sync")}
        </Text>
      ) : null}
    </View>
  );
}
