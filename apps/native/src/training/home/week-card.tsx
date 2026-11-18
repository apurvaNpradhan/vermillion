import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { ProgressRing } from "@/platform/ui/progress-ring";
import { RadarChart } from "@/platform/ui/radar-chart";
import type { MuscleRadarAxis } from "@/training/muscles/muscle-axes";

import { goalFraction, type WeekSummary } from "./home-stats";

/**
 * Home's This week: the goal ring (sessions of the goal), sets and volume with their change on the
 * same days of last week, and a small radar of this week's muscle groups against their targets
 * that opens Muscles.
 */
export function WeekCard({
  summary,
  goal,
  volume,
  axes,
  radarLabel,
}: {
  summary: WeekSummary;
  goal: number | null;
  /** Volume with its unit, already formatted. */
  volume: string;
  axes: readonly MuscleRadarAxis[];
  radarLabel: string;
}) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const percent = (ratio: number | null) =>
    ratio === null
      ? null
      : t("home__delta", {
          value: new Intl.NumberFormat(i18n.language, {
            style: "percent",
            maximumFractionDigits: 0,
            signDisplay: "exceptZero",
          }).format(ratio),
        });
  const ringLabel =
    goal === null
      ? t("stats__sessions_other", { count: summary.sessions })
      : t("session__goal_accessible", { count: summary.sessions, goal });
  const stat = (label: string, value: string, change: number | null) => (
    <View className="gap-0.5">
      <Text className="text-caption text-muted">{label}</Text>
      <Text className="text-numeric-md tabular-nums text-foreground">{value}</Text>
      {change === null ? null : (
        <Text className="text-caption tabular-nums text-muted">{percent(change)}</Text>
      )}
    </View>
  );
  return (
    <View className="gap-4 rounded-2xl bg-surface p-4">
      <Text accessibilityRole="header" className="text-title-md font-semibold text-foreground">
        {t("home__week")}
      </Text>
      <View className="flex-row items-center gap-4">
        <ProgressRing fraction={goalFraction(summary.sessions, goal)} size={72} label={ringLabel}>
          <Text className="text-numeric-md tabular-nums text-foreground">
            {goal === null
              ? summary.sessions
              : t("session__goal_ratio", { done: summary.sessions, goal })}
          </Text>
        </ProgressRing>
        <View className="flex-1 gap-3">
          {stat(t("stats__sets"), `${summary.sets}`, summary.setsChange)}
          {stat(t("stats__volume"), volume, summary.volumeChange)}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={radarLabel}
          onPress={() => router.push("/muscles")}
          className="rounded-xl active:bg-default"
        >
          <RadarChart
            compact
            size={84}
            axes={axes.map((axis) => ({
              key: axis.key,
              label: axis.key,
              value: axis.sets,
              target: axis.target,
            }))}
            accessibilityLabel={radarLabel}
          />
        </Pressable>
      </View>
    </View>
  );
}
