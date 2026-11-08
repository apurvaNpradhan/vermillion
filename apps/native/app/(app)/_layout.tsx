import { Tabs } from "expo-router";
import { GearSix, NotePencil, SunHorizon, type IconProps } from "phosphor-react-native";
import type { ComponentType } from "react";
import type { ColorValue } from "react-native";

import { AccountSummary } from "@/account";
import { useTranslation } from "@/platform/i18n";
import { TabActionProvider } from "@/platform/navigation/tab-action";
import { TabBar } from "@/platform/navigation/tab-bar";
import { isColorString } from "@/platform/theme";
import { useAccountLocale } from "@/preferences";

// Vermillion icon rules: Phosphor Regular, Fill when selected. The tab bar passes a plain color
// string; Phosphor does not take React Native's opaque platform colors.
const tabIcon =
  (Icon: ComponentType<IconProps>) =>
  ({ focused, color, size }: { focused: boolean; color: ColorValue; size: number }) => (
    <Icon
      color={isColorString(color) ? color : undefined}
      size={size}
      weight={focused ? "fill" : "regular"}
    />
  );

/**
 * The signed-in tabs. The first two sit on the floating pill; the rest (up to five in all) are
 * in the switcher's menu, in declaration order. Pages draw their own collapsing header.
 */
export default function AppLayout() {
  const { t } = useTranslation();
  useAccountLocale();

  return (
    <TabActionProvider>
      <Tabs
        tabBar={(props) => <TabBar {...props} menuHeader={<AccountSummary />} />}
        // Instant switches, as in Linear: a cross-fade shows the old page through the new one.
        screenOptions={{ headerShown: false, animation: "none" }}
      >
        <Tabs.Screen
          name="index"
          options={{ title: t("nav__home"), tabBarIcon: tabIcon(SunHorizon) }}
        />
        <Tabs.Screen
          name="notes"
          options={{ title: t("notes__title"), tabBarIcon: tabIcon(NotePencil) }}
        />
        <Tabs.Screen
          name="settings"
          options={{ title: t("nav__settings"), tabBarIcon: tabIcon(GearSix) }}
        />
      </Tabs>
    </TabActionProvider>
  );
}
