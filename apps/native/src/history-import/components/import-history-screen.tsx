import { FilePlus, MagnifyingGlass, ProhibitInset } from "phosphor-react-native";
import { usePreventRemove } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import type { ReactNode } from "react";

import { useTranslation } from "@/platform/i18n";
import { useDeviceTimeZone } from "@/platform/i18n/device-time-zone";
import { useHideTabBar } from "@/platform/navigation/tab-action";
import { Button } from "@/platform/ui/button";
import { ConfirmationDialog } from "@/platform/ui/confirmation-dialog";
import { ActionSheet } from "@/platform/ui/action-sheet";
import { Field } from "@/platform/ui/field";
import { FormError } from "@/platform/ui/form-error";
import { ListSection } from "@/platform/ui/list";
import { ScrollPage } from "@/platform/ui/page";
import { SegmentedControl } from "@/platform/ui/segmented-control";
import { StatTiles } from "@/platform/ui/stat-tiles";

import { useHistoryImport, type FailReason } from "../use-history-import";
import { ImportOmissions } from "./import-omissions";
import { ImportProgress } from "./import-progress";
import { ImportReceiptCard } from "./import-receipt-card";
import { UnmatchedExerciseRow } from "./unmatched-exercise-row";

const FAILURE_KEYS = {
  csv_syntax: "import__error_csv_syntax",
  csv_limit: "import__error_csv_limit",
  unreadable: "import__error_unreadable",
  invalid_rows: "import__error_invalid_rows",
  unknown_format: "import__error_format",
  empty: "import__error_empty",
  import_failed: "import__error_import",
  undo_failed: "import__error_undo",
} as const satisfies Record<FailReason, string>;

/**
 * Import history: choose a Strong or Hevy CSV, check what it would add and match its exercise
 * names, import, and undo. Import and Export share the same page header.
 */
export function ImportHistoryScreen({
  title,
  navigation,
  exportPane,
}: {
  title: string;
  navigation: ReactNode;
  exportPane: ReactNode | null;
}) {
  const { t, i18n } = useTranslation();
  const flow = useHistoryImport();
  const [matching, setMatching] = useState<string | null>(null);
  const [confirmUndo, setConfirmUndo] = useState(false);
  const { step, file, summary } = flow;
  const writing = step.kind === "importing" || step.kind === "undoing";
  useHideTabBar(writing);
  // Imports can be cancelled with their own button, after which the receipt is ready to read.
  usePreventRemove(writing, () => undefined);
  const deviceZone = useDeviceTimeZone();
  const formatDate = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeZone: deviceZone }).format(
      new Date(iso),
    );
  const formatSourceDate = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language, {
      dateStyle: "medium",
      timeZone: flow.timeZone.trim(),
    }).format(new Date(iso));
  const target = flow.unmatched.find((item) => item.key === matching);

  return (
    <>
      <ConfirmationDialog
        isOpen={confirmUndo}
        onOpenChange={setConfirmUndo}
        title={t("import__undo_title")}
        description={t("import__undo_body", {
          count: flow.imported?.sessions ?? flow.receipt?.sessions ?? 0,
        })}
        cancelLabel={t("common__cancel")}
        confirmLabel={t("import__undo")}
        destructive
        onConfirm={() => void flow.undo()}
      />
      <ActionSheet
        title={target?.name ?? ""}
        isOpen={target !== undefined}
        onOpenChange={(open) => {
          if (!open) setMatching(null);
        }}
        actions={
          target
            ? [
                {
                  key: "pick",
                  label: t("import__action_pick"),
                  icon: MagnifyingGlass,
                  onPress: () => void flow.mapName(target.key),
                },
                {
                  key: "create",
                  label: t("import__action_create"),
                  icon: FilePlus,
                  onPress: () => flow.setResolution(target.key, { kind: "create" }),
                },
                {
                  key: "skip",
                  label: t("import__action_skip"),
                  icon: ProhibitInset,
                  tone: "danger",
                  onPress: () => flow.setResolution(target.key, { kind: "skip" }),
                },
              ]
            : []
        }
      />
      <ScrollPage back={!writing} title={title} backFallback="/settings">
        {step.kind === "idle" || step.kind === "failed" ? navigation : null}
        {exportPane}
        {exportPane === null && (step.kind === "idle" || step.kind === "failed") ? (
          <>
            {step.kind === "failed" ? <FormError message={t(FAILURE_KEYS[step.reason])} /> : null}
            <ListSection title={t("import__title")}>
              <View className="gap-3 p-4">
                <Text className="font-normal text-body text-muted">{t("import__intro")}</Text>
                <Button
                  variant="primary"
                  isDisabled={!flow.ready}
                  onPress={() => void flow.pickFile()}
                >
                  <Button.Label>{t("import__choose")}</Button.Label>
                </Button>
                <Text className="font-normal text-caption text-muted">{t("import__formats")}</Text>
              </View>
            </ListSection>
            {flow.receipt ? (
              <ListSection title={t("import__last")}>
                <ImportReceiptCard
                  receipt={flow.receipt}
                  imported={flow.imported}
                  keptOffset={flow.keptOffset}
                  changeKeptPage={flow.changeKeptPage}
                  formatDate={formatDate}
                  onUndo={() => setConfirmUndo(true)}
                />
              </ListSection>
            ) : null}
          </>
        ) : null}

        {step.kind === "reading" ? (
          <ImportProgress label={t("import__reading")} progress={step.progress} />
        ) : null}
        {step.kind === "importing" ? (
          <>
            <ImportProgress label={t("import__importing")} progress={step.progress} />
            <Button variant="ghost" isDisabled={flow.cancelling} onPress={flow.cancelImport}>
              <Button.Label>
                {t(flow.cancelling ? "import__cancelling" : "common__cancel")}
              </Button.Label>
            </Button>
          </>
        ) : null}
        {step.kind === "undoing" ? (
          <ImportProgress label={t("import__undoing")} progress={step.progress} />
        ) : null}

        {step.kind === "preview" && file ? (
          <>
            <View className="gap-1">
              <Text className="text-body font-medium text-foreground" numberOfLines={1}>
                {file.name}
              </Text>
              <Text className="font-normal text-caption text-muted">
                {t("import__file_detail", {
                  source: t(`import__format_${file.format}`),
                  count: file.workouts,
                })}
              </Text>
              {file.from && file.to ? (
                <Text className="font-normal text-caption text-muted">
                  {`${formatSourceDate(file.from)} – ${formatSourceDate(file.to)}`}
                </Text>
              ) : null}
            </View>
            <StatTiles
              items={[
                {
                  label: t("import__stat_workouts"),
                  value: summary.planning ? "…" : String(summary.sessions),
                },
                {
                  label: t("import__stat_sets"),
                  value: summary.planning ? "…" : String(summary.sets),
                },
                {
                  label: t("import__stat_skipped"),
                  value: summary.planning ? "…" : String(summary.duplicates),
                  detail: t("import__stat_skipped_detail"),
                },
              ]}
            />
            <Field
              label={t("import__source_zone")}
              description={t("import__source_zone_hint")}
              error={flow.timeZoneValid ? undefined : t("import__source_zone_invalid")}
              value={flow.timeZone}
              onChangeText={flow.setTimeZone}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={90}
            />
            {file.ambiguousDates ? (
              <SegmentedControl
                accessibilityLabel={t("import__date_order")}
                value={flow.dayFirst ? "day" : "month"}
                onChange={(value) => flow.setDayFirst(value === "day")}
                options={[
                  { value: "day", label: t("import__day_first") },
                  { value: "month", label: t("import__month_first") },
                ]}
              />
            ) : null}
            {file.gaps > 0 ? (
              <Text className="font-normal text-caption text-danger">
                {t("import__dst_gap", { count: file.gaps })}
              </Text>
            ) : null}
            {file.overlaps > 0 ? (
              <Text className="font-normal text-caption text-muted">
                {t("import__dst_overlap", { count: file.overlaps })}
              </Text>
            ) : null}
            {!flow.unitFromFile ? (
              <View className="gap-2">
                <Text className="px-1 font-semibold text-overline uppercase text-muted">
                  {t("import__unit_title")}
                </Text>
                <SegmentedControl
                  accessibilityLabel={t("import__unit_title")}
                  value={flow.unit}
                  onChange={flow.setUnit}
                  options={[
                    { value: "kg", label: t("import__unit_kg") },
                    { value: "lb", label: t("import__unit_lb") },
                  ]}
                />
                <Text className="font-normal px-1 text-caption text-muted">
                  {t("import__unit_assumed")}
                </Text>
              </View>
            ) : null}
            {flow.unmatched.length > 0 ? (
              <ListSection title={t("import__unmatched_title")}>
                <Text className="font-normal px-1 pb-1 text-caption text-muted">
                  {t("import__unmatched_hint", { count: flow.matchedCount })}
                </Text>
                {flow.unmatched.map((item) => (
                  <UnmatchedExerciseRow
                    key={item.key}
                    item={item}
                    onPress={() => setMatching(item.key)}
                  />
                ))}
              </ListSection>
            ) : (
              <Text className="font-normal text-caption text-muted">
                {t("import__all_matched", { count: flow.matchedCount })}
              </Text>
            )}
            {!summary.planning && summary.skippedOther > 0 ? (
              <Text className="font-normal text-caption text-muted">
                {t("import__skipped_other", { count: summary.skippedOther })}
              </Text>
            ) : null}
            {!summary.planning ? <ImportOmissions {...summary} /> : null}
            {file.unreadableRows > 0 ? (
              <Text className="font-normal px-1 text-caption text-muted">
                {t("import__unreadable_rows", { count: file.unreadableRows })}
              </Text>
            ) : null}
            {!summary.planning && summary.creating > 0 ? (
              <Text className="font-normal px-1 text-caption text-muted">
                {t("import__will_create", { count: summary.creating })}
              </Text>
            ) : null}
            <View className="gap-2">
              <Button
                variant="primary"
                isDisabled={!flow.timeZoneValid || summary.planning || summary.sessions === 0}
                onPress={() => void flow.startImport()}
              >
                <Button.Label>
                  {summary.sessions === 0 && !summary.planning
                    ? t("import__nothing_new")
                    : t("import__start", { count: summary.sessions })}
                </Button.Label>
              </Button>
              <Button variant="ghost" onPress={flow.reset}>
                <Button.Label>{t("import__choose_another")}</Button.Label>
              </Button>
            </View>
          </>
        ) : null}

        {step.kind === "done" && flow.receipt ? (
          <>
            <ListSection title={t("import__done_title")}>
              <ImportReceiptCard
                receipt={flow.receipt}
                imported={flow.imported}
                keptOffset={flow.keptOffset}
                changeKeptPage={flow.changeKeptPage}
                formatDate={formatDate}
                onUndo={() => setConfirmUndo(true)}
              />
            </ListSection>
            <Button variant="primary" onPress={flow.reset}>
              <Button.Label>{t("import__done")}</Button.Label>
            </Button>
          </>
        ) : null}
      </ScrollPage>
    </>
  );
}
