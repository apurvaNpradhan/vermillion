import { Switch } from "heroui-native";
import { Bug } from "phosphor-react-native";

import { useCrashReports } from "@/platform/crash-reporting";
import { useTranslation } from "@/platform/i18n";
import { ListRow } from "@/platform/ui/list";

/** The per-device "Send crash reports" switch; absent in a build with no Sentry project. */
export function CrashReportsRow() {
  const { t } = useTranslation();
  const reports = useCrashReports();
  if (!reports.available) return null;
  return (
    <ListRow
      icon={Bug}
      title={t("settings__crash_reports")}
      description={t("settings__crash_reports_hint")}
      accessory="none"
      checked={reports.enabled}
      onPress={() => reports.set(!reports.enabled)}
      trailing={
        <Switch
          accessibilityLabel={t("settings__crash_reports")}
          isSelected={reports.enabled}
          onSelectedChange={reports.set}
        />
      }
    />
  );
}
