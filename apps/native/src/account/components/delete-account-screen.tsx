import { Text } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { ScrollPage } from "@/platform/ui/page";

import { DeleteAccountSection } from "./delete-account-section";

/** Account deletion, pushed from settings: what it does, then the typed confirmation. */
export function DeleteAccountScreen() {
  const { t } = useTranslation();
  return (
    <ScrollPage title={t("settings__delete_title")} back>
      <Text className="text-body text-subtle">{t("settings__delete_body")}</Text>
      <DeleteAccountSection />
    </ScrollPage>
  );
}
