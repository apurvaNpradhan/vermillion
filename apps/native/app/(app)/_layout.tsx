import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { useThemeColor } from "heroui-native";

import { useTranslation } from "@/platform/i18n";
import { useAccountLocale } from "@/preferences";

export default function AppLayout() {
  const { t } = useTranslation();
  const accent = useThemeColor("accent");
  const muted = useThemeColor("muted");
  const background = useThemeColor("background");
  const foreground = useThemeColor("foreground");
  useAccountLocale();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: accent,
        tabBarInactiveTintColor: muted,
        tabBarStyle: { backgroundColor: background },
        headerStyle: { backgroundColor: background },
        headerTintColor: foreground,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t("nav__dashboard"),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="notes"
        options={{
          title: t("notes__title"),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="document-text-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t("nav__settings"),
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings-outline" color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
