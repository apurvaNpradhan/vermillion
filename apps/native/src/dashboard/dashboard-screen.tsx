import { useRouter } from "expo-router";
import { useThemeColor } from "heroui-native";
import { ArrowUpRight } from "phosphor-react-native";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { useCurrentUser } from "@/account";
import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";
import { Horizon } from "@/platform/ui/horizon";
import { NumberFlow } from "@/platform/ui/number-flow";
import { ScrollPage } from "@/platform/ui/page";

import { useDashboardStats } from "./use-dashboard-stats";

/** Real template data, with one useful next action; sync metadata is deliberately secondary. */
export function DashboardScreen() {
  const { t } = useTranslation();
  const { user } = useCurrentUser();
  const stats = useDashboardStats();
  const router = useRouter();
  const [surface, control, onAction] = useThemeColor(["surface", "default", "accent-foreground"]);

  return (
    <ScrollPage title={user ? t("dashboard__welcome", { name: user.name }) : t("nav__home")}>
      <View className="gap-5">
        <View className="overflow-hidden rounded-2xl bg-surface">
          <View
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={StyleSheet.absoluteFill}
          >
            <Svg width="100%" height="100%">
              <Defs>
                <LinearGradient id="home-mineral" x1="0" y1="0" x2="1" y2="1">
                  <Stop offset="0" stopColor={control} stopOpacity={0.7} />
                  <Stop offset="1" stopColor={surface} />
                </LinearGradient>
              </Defs>
              <Rect width="100%" height="100%" fill="url(#home-mineral)" />
            </Svg>
          </View>
          <View className="gap-8 p-6">
            <Horizon />
            <View className="gap-3">
              <Text className="text-label font-medium text-identity">
                {t("dashboard__hero_eyebrow")}
              </Text>
              <Text
                accessibilityRole="header"
                className="text-title-xl font-semibold text-foreground"
              >
                {t("dashboard__hero_title")}
              </Text>
              <Text className="text-body text-subtle">{t("dashboard__hero_body")}</Text>
            </View>
            <View className="gap-1">
              <NumberFlow
                value={stats.exercises}
                className="text-numeric-xl font-semibold text-foreground"
              />
              <Text className="text-label text-muted">{t("dashboard__stat_exercises")}</Text>
            </View>
            <Button
              variant="primary"
              className="min-h-12"
              onPress={() => router.push("/exercises")}
            >
              <Button.Label>{t("dashboard__open_exercises")}</Button.Label>
              <ArrowUpRight size={18} color={onAction} />
            </Button>
          </View>
        </View>
        <Text className="px-1 text-caption tabular-nums text-muted">
          {stats.pendingChanges > 0
            ? t("dashboard__sync_pending", { count: stats.pendingChanges })
            : t("dashboard__sync_clear")}
        </Text>
      </View>
    </ScrollPage>
  );
}
