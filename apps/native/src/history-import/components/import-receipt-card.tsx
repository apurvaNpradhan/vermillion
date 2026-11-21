import type { ImportedSessions, ImportReceipt } from "@workspace/sync";
import { Text, View } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";
import { StatTiles } from "@/platform/ui/stat-tiles";

import { ImportOmissions } from "./import-omissions";

/**
 * What an import did: the workouts and sets written, exercises created, workouts skipped. Undo
 * import removes exactly the workouts of that import.
 */
export function ImportReceiptCard({
  receipt,
  imported,
  keptOffset,
  changeKeptPage,
  formatDate,
  onUndo,
}: {
  receipt: ImportReceipt;
  imported: ImportedSessions | null;
  keptOffset: number;
  changeKeptPage: (delta: number) => void;
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
            value: String(imported?.sessions ?? receipt.sessions),
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
      {!receipt.complete ? (
        <Text className="text-caption text-muted">{t("import__partial")}</Text>
      ) : null}
      <ImportOmissions {...receipt} />
      {receipt.undoStarted && imported ? (
        imported.pending > 0 ? (
          <Text className="text-caption text-muted">{t("import__undo_pending")}</Text>
        ) : imported.sessions > 0 ? (
          <View className="gap-1">
            <Text className="text-caption text-muted">
              {t("import__undo_kept", { count: imported.sessions })}
            </Text>
            {imported.kept.map((workout) => (
              <Text key={workout.id} className="text-caption text-foreground">
                {t("import__kept_workout", {
                  title: workout.title,
                  date: formatDate(workout.startedAt),
                })}
              </Text>
            ))}
            {imported.sessions > keptOffset + imported.kept.length ? (
              <Button variant="ghost" onPress={() => changeKeptPage(20)}>
                <Button.Label>{t("import__kept_next")}</Button.Label>
              </Button>
            ) : null}
            {keptOffset > 0 ? (
              <Button variant="ghost" onPress={() => changeKeptPage(-20)}>
                <Button.Label>{t("import__kept_previous")}</Button.Label>
              </Button>
            ) : null}
          </View>
        ) : null
      ) : null}
      {receipt.legacy ? (
        <Text className="text-caption text-muted">{t("import__undo_legacy")}</Text>
      ) : (
        <Button variant="danger-soft" isDisabled={Boolean(imported?.pending)} onPress={onUndo}>
          <Button.Label>{t("import__undo")}</Button.Label>
        </Button>
      )}
    </View>
  );
}
