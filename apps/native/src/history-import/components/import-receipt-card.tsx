import { Text, View } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";
import { StatTiles } from "@/platform/ui/stat-tiles";

import type { ImportReceipt } from "../import-receipt";

/**
 * What an import did: the workouts and sets written, exercises created, workouts skipped. Undo
 * import removes exactly the workouts of that import.
 */
export function ImportReceiptCard({
  receipt,
  liveSessions,
  formatDate,
  onUndo,
}: {
  receipt: ImportReceipt;
  /** Workouts of the import still in the app (some may have been deleted since). */
  liveSessions: number | null;
  formatDate: (iso: string) => string;
  onUndo: () => void;
}) {
  const { t } = useTranslation();
  const range =
    receipt.from && receipt.to
      ? `${formatDate(receipt.from)} – ${formatDate(receipt.to)}`
      : undefined;
  return (
    <View className="gap-4 rounded-2xl bg-surface p-4">
      <Text className="text-body text-muted">
        {t("import__receipt_when", {
          date: formatDate(receipt.importedAt),
          source: t(`import__format_${receipt.format}`),
        })}
      </Text>
      <StatTiles
        items={[
          {
            label: t("import__stat_workouts"),
            value: String(liveSessions ?? receipt.sessions),
            detail: range,
          },
          { label: t("import__stat_sets"), value: String(receipt.sets) },
          { label: t("import__stat_created"), value: String(receipt.createdExercises) },
          { label: t("import__stat_skipped"), value: String(receipt.skippedDuplicates) },
        ]}
      />
      {receipt.skippedOther > 0 ? (
        <Text className="text-caption text-muted">
          {t("import__receipt_other_skipped", { count: receipt.skippedOther })}
        </Text>
      ) : null}
      <Button variant="danger-soft" onPress={onUndo}>
        <Button.Label>{t("import__undo")}</Button.Label>
      </Button>
    </View>
  );
}
