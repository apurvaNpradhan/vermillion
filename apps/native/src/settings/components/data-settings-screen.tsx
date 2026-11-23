import { useState } from "react";
import { DownloadSimple } from "phosphor-react-native";

import { ImportHistoryScreen } from "@/history-import";
import { useTranslation } from "@/platform/i18n";
import { SegmentedControl } from "@/platform/ui/segmented-control";
import { ListRow, ListSection } from "@/platform/ui/list";

import { useExportData } from "../export-data";

export function DataSettingsScreen() {
  const { t } = useTranslation();
  const [pane, setPane] = useState<"import" | "export">("import");
  const exportData = useExportData();
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
          <ListSection>
            <ListRow
              icon={DownloadSimple}
              title={t("settings__export_title")}
              description={t("settings__export_hint")}
              accessory="none"
              disabled={!exportData.ready || exportData.pending}
              onPress={() => void exportData.run()}
            />
          </ListSection>
        ) : null
      }
    />
  );
}
