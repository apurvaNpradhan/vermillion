import { DownloadSimple } from "phosphor-react-native";

import { ImportHistoryScreen } from "@/history-import";
import { useTranslation } from "@/platform/i18n";
import { ListRow, ListSection } from "@/platform/ui/list";

import { useExportData } from "../export-data";

/**
 * Your data, pushed from Settings: export every finished workout as a Strong-format CSV (which
 * Hevy and Lyfta import), and import from Strong or Hevy, with the last import and its undo.
 */
export function DataSettingsScreen() {
  const { t } = useTranslation();
  const exportData = useExportData();
  return (
    <ImportHistoryScreen
      title={t("settings__data_title")}
      header={
        <ListSection title={t("settings__export_section")}>
          <ListRow
            icon={DownloadSimple}
            title={t("settings__export_title")}
            description={t("settings__export_hint")}
            accessory="none"
            disabled={!exportData.ready || exportData.pending}
            onPress={() => void exportData.run()}
          />
        </ListSection>
      }
    />
  );
}
