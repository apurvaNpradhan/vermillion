import { useRouter } from "expo-router";
import { useMemo, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { NumberFlow } from "@/platform/ui/number-flow";
import { ProgressRing } from "@/platform/ui/progress-ring";
import { RadarChart } from "@/platform/ui/radar-chart";
import { radarValue, type MuscleRadarAxis } from "@/training/muscles/muscle-axes";

import { goalFraction, type WeekSummary } from "./home-stats";

/**
 * Home's This week: the goal ring (sessions of the goal; with no goal just the session count, as
 * text, since there is nothing to progress towards), sets and volume with their change on the same
 * days of last week, and a small radar of this week's weighted muscle volume against targets that
 * opens Muscles.
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
  /** Volume in the shown unit, with that unit's label. */
  volume: { value: number; unit: string };
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
  const sessionsLabel = t("stats__sessions", { count: summary.sessions });
  const radarAxes = useMemo(
    () =>
      axes.map((axis) => ({
        key: axis.key,
        label: axis.key,
        value: radarValue(axis),
        target: axis.target,
      })),
    [axes],
  );
  const stat = (label: string, value: ReactNode, change: number | null) => (
    <View className="gap-0.5">
      <Text className="text-caption text-muted">{label}</Text>
      {value}
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
        {goal === null ? (
          <Text
            accessibilityLabel={sessionsLabel}
            numberOfLines={2}
            className="w-[72px] text-center text-body font-medium tabular-nums text-foreground"
          >
            {sessionsLabel}
          </Text>
        ) : (
          <ProgressRing
            fraction={goalFraction(summary.sessions, goal)}
            size={72}
            label={t("session__goal_accessible", { count: summary.sessions, goal })}
          >
            <Text className="text-numeric-md tabular-nums text-foreground">
              {t("session__goal_ratio", { done: summary.sessions, goal })}
            </Text>
          </ProgressRing>
        )}
        <View className="flex-1 gap-3">
          {stat(
            t("stats__sets"),
            <NumberFlow value={summary.sets} locale={i18n.language} size="md" />,
            summary.setsChange,
          )}
          {stat(
            t("stats__volume"),
            <NumberFlow
              value={volume.value}
              locale={i18n.language}
              size="md"
              suffix={volume.unit}
            />,
            summary.volumeChange,
          )}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={radarLabel}
          onPress={() => router.push("/muscles")}
          className="rounded-xl active:bg-default"
        >
          <RadarChart compact size={84} axes={radarAxes} accessibilityLabel={radarLabel} />
        </Pressable>
      </View>
    </View>
  );
}
