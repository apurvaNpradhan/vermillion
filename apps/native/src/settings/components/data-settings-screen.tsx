import { useState } from "react";
import { Text } from "react-native";
import { Archive, FileCsv, Scales, Ruler } from "phosphor-react-native";

import { ImportHistoryScreen } from "@/history-import";
import { useTranslation } from "@/platform/i18n";
import { SegmentedControl } from "@/platform/ui/segmented-control";
import { ListRow, ListSection } from "@/platform/ui/list";

import { useExportRecord } from "../export-data";
import type { RecordKind } from "../export-builders";

export function DataSettingsScreen() {
  const { t } = useTranslation();
  const [pane, setPane] = useState<"import" | "export">("import");
  const record = useExportRecord();
  const rows: { kind: RecordKind; icon: typeof Archive; title: string; hint: string }[] = [
    {
      kind: "backup",
      icon: Archive,
      title: t("settings__record_backup"),
      hint: t("settings__record_backup_hint"),
    },
    {
      kind: "history",
      icon: FileCsv,
      title: t("settings__export_title"),
      hint: t("settings__export_hint"),
    },
    {
      kind: "weights",
      icon: Scales,
      title: t("settings__record_weights"),
      hint: t("settings__record_weights_hint"),
    },
    {
      kind: "measurements",
      icon: Ruler,
      title: t("settings__record_measurements"),
      hint: t("settings__record_measurements_hint"),
    },
  ];
  return (
    <ImportHistoryScreen
      title={t("settings__data_title")}
      navigation={
        <SegmentedControl
          accessibilityLabel={t("settings__data_title")}
          value={pane}
          onChange={setPane}
          options={[
            { value: "import", label: t("settings__import_section") },
            { value: "export", label: t("settings__export_section") },
          ]}
        />
      }
      exportPane={
        pane === "export" ? (
          <ListSection title={t("settings__record_title")}>
            {!record.hasSynced ? (
              <Text className="px-4 py-2 text-caption text-muted">
                {t("settings__export_waiting_for_sync")}
              </Text>
            ) : null}
            {rows.map((row) => (
              <ListRow
                key={row.kind}
                icon={row.icon}
                title={row.title}
                description={row.hint}
                accessory="none"
                disabled={!record.ready || record.pending !== null}
                onPress={() => void record.run(row.kind)}
              />
            ))}
          </ListSection>
        ) : null
      }
    />
  );
}
