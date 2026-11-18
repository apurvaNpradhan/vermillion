import { MagnifyingGlass, WarningCircle, WifiSlash } from "phosphor-react-native";
import { useTranslation } from "@/platform/i18n";
import { EmptyState } from "@/platform/ui/empty-state";

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
    <EmptyState
      icon={MagnifyingGlass}
      title={t("exercise__no_matches")}
      action={
        canClear
          ? { label: t("exercise__clear_filters"), onPress: onClear }
          : onCreate
            ? {
                label: query ? t("exercise__create_named", { name: query }) : t("exercise__new"),
                onPress: () => onCreate(query),
              }
            : undefined
      }
    />
  );
}

/** The Archived list is empty: a plain note, nothing to fix. */
export function ArchivedEmptyState({ onBrowse }: { onBrowse: () => void }) {
  const { t } = useTranslation();
  return (
    <EmptyState
      icon={MagnifyingGlass}
      title={t("exercise__archived_empty")}
      action={{ label: t("exercise__clear_filters"), onPress: onBrowse }}
    />
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
