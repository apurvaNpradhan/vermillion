import { Stack } from "expo-router";
import { useThemeColor } from "heroui-native";

import { useTranslation } from "@/platform/i18n";

export default function SettingsLayout() {
  const { t } = useTranslation();
  const background = useThemeColor("background");
  const foreground = useThemeColor("foreground");
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: background },
        headerTintColor: foreground,
      }}
    >
      <Stack.Screen name="index" options={{ title: t("settings__title") }} />
      <Stack.Screen name="preferences" options={{ title: t("settings__nav_preferences") }} />
    </Stack>
  );
}
