import { MagnifyingGlass, WarningCircle, WifiSlash } from "phosphor-react-native";
import { Text, View } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";
import { EmptyState } from "@/platform/ui/empty-state";
import { Skeleton } from "@/platform/ui/skeleton";

import { THUMBNAIL_SIZE } from "./exercise-thumbnail";

/** Placeholder rows shaped like exercise rows; the first load only. */
export function ExerciseSkeletonRows({ count = 6, label }: { count?: number; label: string }) {
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityState={{ busy: true }}
    >
      {Array.from({ length: count }, (_, index) => (
        <View
          key={index}
          className="min-h-[72px] flex-row items-center gap-3 border-b border-border px-4 py-2"
        >
          <Skeleton style={{ width: THUMBNAIL_SIZE, height: THUMBNAIL_SIZE }} />
          <View className="flex-1 gap-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </View>
        </View>
      ))}
    </View>
  );
}

/** The catalog is still downloading: skeleton rows and one line saying so. */
export function FirstSyncState() {
  const { t } = useTranslation();
  return (
    <View className="gap-3 pt-2">
      <ExerciseSkeletonRows label={t("common__loading")} />
      <Text accessibilityLiveRegion="polite" className="text-center text-caption text-muted">
        {t("exercise__first_sync")}
      </Text>
    </View>
  );
}

/** Nothing has downloaded and there is no connection: say so, and offer to create an exercise. */
export function OfflineState({ onCreate }: { onCreate?: (title: string) => void }) {
  const { t } = useTranslation();
  return (
    <EmptyState
      icon={WifiSlash}
      title={t("exercise__offline_title")}
      action={
        onCreate ? { label: t("exercise__offline_create"), onPress: () => onCreate("") } : undefined
      }
    />
  );
}

/** A search or filter matched nothing: clear the filters, or create what was searched for. */
export function NoMatchesState({
  query,
  canClear,
  onClear,
  onCreate,
}: {
  query: string;
  canClear: boolean;
  onClear: () => void;
  onCreate?: (title: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <View className="items-center gap-4 px-6 py-12">
      <EmptyState icon={MagnifyingGlass} title={t("exercise__no_matches")} />
      <View className="gap-3 self-stretch">
        {canClear ? (
          <Button variant="secondary" onPress={onClear}>
            <Button.Label>{t("exercise__clear_filters")}</Button.Label>
          </Button>
        ) : null}
        {onCreate && query !== "" ? (
          <Button variant="primary" onPress={() => onCreate(query)}>
            <Button.Label>{t("exercise__create_named", { name: query })}</Button.Label>
          </Button>
        ) : null}
      </View>
    </View>
  );
}

/** The Archived list is empty: a plain note, nothing to fix. */
export function ArchivedEmptyState() {
  const { t } = useTranslation();
  return (
    <Text className="px-6 py-12 text-center text-body text-muted">
      {t("exercise__archived_empty")}
    </Text>
  );
}

/** A local read failed. Never shown as "no results". */
export function LoadFailedState({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <EmptyState
      icon={WarningCircle}
      title={t("exercise__load_failed")}
      action={{ label: t("exercise__retry"), onPress: onRetry }}
    />
  );
}
