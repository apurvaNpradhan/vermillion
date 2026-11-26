import { Lightbulb } from "phosphor-react-native";

import { useTranslation } from "@/platform/i18n";
import { ListRow } from "@/platform/ui/list";
import { useAppToast } from "@/platform/ui/use-app-toast";
import { usePreferences } from "@/preferences";

/** "Show tips again": opens the three once-only hints again. */
export function ShowTipsRow() {
  const { t } = useTranslation();
  const { toast } = useAppToast();
  const { resetHintDismissals } = usePreferences();
  return (
    <ListRow
      icon={Lightbulb}
      title={t("settings__show_tips")}
      accessory="none"
      onPress={() => {
        void resetHintDismissals()
          .then(() => toast.show({ label: t("settings__tips_shown") }))
          .catch(() => undefined);
      }}
    />
  );
}
