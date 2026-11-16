import { Switch } from "heroui-native";
import { Eye } from "phosphor-react-native";

import { useTranslation } from "@/platform/i18n";
import { ListRow } from "@/platform/ui/list";

import { useHidePhotos } from "./use-hide-photos";

/** The settings row for Hide photos: progress photos stay blurred in lists until tapped. */
export function HidePhotosRow() {
  const { t } = useTranslation();
  const hide = useHidePhotos();
  return (
    <ListRow
      icon={Eye}
      title={t("body__photos_hide")}
      description={t("body__photos_hide_hint")}
      accessory="none"
      onPress={() => hide.set(!hide.hidden)}
      trailing={
        <Switch
          accessibilityLabel={t("body__photos_hide")}
          isSelected={hide.hidden}
          onSelectedChange={hide.set}
        />
      }
    />
  );
}
