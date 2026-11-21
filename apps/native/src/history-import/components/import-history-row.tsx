import { ClockCounterClockwise } from "phosphor-react-native";
import { useRouter } from "expo-router";

import { useTranslation } from "@/platform/i18n";
import { ListRow } from "@/platform/ui/list";

/** The Settings row that opens the history import. */
export function ImportHistoryRow() {
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <ListRow
      icon={ClockCounterClockwise}
      title={t("import__row_title")}
      description={t("import__row_description")}
      onPress={() => router.push("/settings/import-history")}
    />
  );
}
