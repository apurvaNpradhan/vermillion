import { Tabs } from "expo-router";
import { Barbell, Books, GearSix, SunHorizon, type IconProps } from "phosphor-react-native";
import type { ComponentType } from "react";
import { Dimensions, Easing, type ColorValue } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { TabActionProvider } from "@/platform/navigation/tab-action";
import { TabBar } from "@/platform/navigation/tab-bar";
import { isColorString } from "@/platform/theme";
import { useThumbnailPrefetch } from "@/exercise";
import { useAccountLocale } from "@/preferences";
import { useSyncStatus } from "@/sync";
import { AccountSummary } from "@/account";
import { ForgottenSessionHost, RestNotificationHost, ResumeBar } from "@/session";

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

/** Share of the window width a tab page travels while switching. */
const SLIDE = 0.28;

/** The pill shows Home and Train; Exercises and Settings are in the switcher's menu (ADR 0036). */
const DIRECT_TABS = 2;

/**
 * The signed-in tabs. The first `DIRECT_TABS` sit on the floating pill; the rest (up to five in
 * all) are in the switcher's menu, in declaration order. Pages draw their own collapsing header.
 */
export default function AppLayout() {
  const { t } = useTranslation();
  useAccountLocale();
  useThumbnailPrefetch();
  const { snapshot } = useSyncStatus();

  return (
    // Reset account-scoped screens and drafts, not the root auth/deep-link state.
    <TabActionProvider key={snapshot?.writeScope ?? "unclaimed"}>
      <Tabs
        tabBar={(props) => (
          <TabBar
            {...props}
            directTabCount={DIRECT_TABS}
            menuHeader={() => <AccountSummary />}
            aboveBar={<ResumeBar />}
          />
        )}
        // Direction-aware horizontal slide: a tab to the right enters from the right.
        screenOptions={{
          headerShown: false,
          // `progress` is -1 for tabs left of the open one, 0 for it, 1 for tabs to its right.
          // The page moves about a quarter of the width and fades faster than it moves, so the
          // two pages do not ghost through each other.
          sceneStyleInterpolator: ({ current }) => ({
            sceneStyle: {
              opacity: current.progress.interpolate({
                inputRange: [-1, -0.7, 0, 0.7, 1],
                outputRange: [0, 0, 1, 0, 0],
              }),
              transform: [
                {
                  translateX: current.progress.interpolate({
                    inputRange: [-1, 0, 1],
                    outputRange: [
                      -SLIDE * Dimensions.get("window").width,
                      0,
                      SLIDE * Dimensions.get("window").width,
                    ],
                  }),
                },
              ],
            },
          }),
          // `motion-page`: 150ms, ease-out; Reduce Motion is honoured by the OS animation scale.
          transitionSpec: {
            animation: "timing",
            config: { duration: 150, easing: Easing.out(Easing.cubic) },
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{ title: t("nav__home"), tabBarIcon: tabIcon(SunHorizon) }}
        />
        <Tabs.Screen
          name="train"
          options={{ title: t("training__title"), tabBarIcon: tabIcon(Barbell) }}
        />
        {/* After the direct tabs, so they land in the switcher menu. */}
        <Tabs.Screen
          name="exercises"
          options={{ title: t("exercise__title"), tabBarIcon: tabIcon(Books) }}
        />
        <Tabs.Screen
          name="settings"
          options={{ title: t("nav__settings"), tabBarIcon: tabIcon(GearSix) }}
        />
      </Tabs>
      <ForgottenSessionHost />
      <RestNotificationHost />
    </TabActionProvider>
  );
}
