import { Text, View } from "react-native";

import { useTranslation } from "@/platform/i18n";

/**
 * The one calm state of a fresh install before its first sync has brought the exercise library and
 * the account's data down. It happens once and needs a connection; no placeholders, no spinner.
 * Offline it says that the download waits for a connection instead of claiming to download.
 */
export function LibrarySetup({ offline = false }: { offline?: boolean }) {
  const { t } = useTranslation();
  return (
    <View accessibilityLiveRegion="polite" className="items-center gap-1 px-6 py-12">
      <Text className="text-center font-semibold text-title-md text-foreground">
        {t(offline ? "library__waiting_title" : "library__setting_up")}
      </Text>
      <Text className="font-normal text-center text-body text-muted">
        {t(offline ? "library__waiting_hint" : "library__setting_up_hint")}
      </Text>
    </View>
  );
}
