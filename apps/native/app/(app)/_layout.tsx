import { Tabs } from "expo-router";
import { useThemeColor } from "heroui-native";
import { GearSix, NotePencil, SquaresFour, type IconProps } from "phosphor-react-native";
import type { ComponentType } from "react";

import { useTranslation } from "@/platform/i18n";
import { useAccountLocale } from "@/preferences";

export default function AppLayout() {
  const { t } = useTranslation();
  const muted = useThemeColor("muted");
  const border = useThemeColor("border");
  const background = useThemeColor("background");
  const foreground = useThemeColor("foreground");
  useAccountLocale();

  // Vermillion icon rules: Phosphor Regular, Fill and text-primary when selected, muted otherwise.
  // Colors come from the theme rather than the tab's ColorValue, which Phosphor does not accept.
  const tabIcon =
    (Icon: ComponentType<IconProps>) =>
    ({ focused }: { focused: boolean }) => (
      <Icon color={focused ? foreground : muted} size={24} weight={focused ? "fill" : "regular"} />
    );

  return (
    <Tabs
      screenOptions={{
        // Selected tab is text-primary with a filled icon; color never marks location.
        tabBarActiveTintColor: foreground,
        tabBarInactiveTintColor: muted,
        tabBarStyle: { backgroundColor: background, borderTopColor: border },
        headerStyle: { backgroundColor: background },
        headerTintColor: foreground,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t("nav__dashboard"),
          tabBarIcon: tabIcon(SquaresFour),
        }}
      />
      <Tabs.Screen
        name="notes"
        options={{
          title: t("notes__title"),
          tabBarIcon: tabIcon(NotePencil),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t("nav__settings"),
          headerShown: false,
          tabBarIcon: tabIcon(GearSix),
        }}
      />
    </Tabs>
  );
}
