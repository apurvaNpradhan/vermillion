import { changeOver, formatBodyWeight, shownWeight } from "@workspace/shared";
import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { Sparkline } from "@/platform/ui/charts/sparkline";

import type { useWeight } from "./use-weight";

/** Days of trend the sparkline draws. */
const SPARK_DAYS = 30;

/**
 * Home's weight card: the trend now, a bare sparkline of the last month and one muted line with
 * this week's change and the goal. Parts without data are left out. Opens the Weight screen. It
 * takes the weight state from its screen so Home has one loading state.
 */
export function WeightTrendCard({ weight }: { weight: ReturnType<typeof useWeight> }) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const unit = weight.unit;
  const week = changeOver(weight.series, 7);
  const change =
    week === null
      ? null
      : new Intl.NumberFormat(i18n.language, {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
          signDisplay: "exceptZero",
        }).format(shownWeight(week, weight.unit));
  const goal =
    weight.goal === null ? null : formatBodyWeight(weight.goal, weight.unit, i18n.language);
  const line =
    change !== null && goal !== null
      ? t("body__trend_line_both", { change, goal, unit })
      : change !== null
        ? t("body__trend_line_change", { change, unit })
        : goal !== null
          ? t("body__trend_line_goal", { goal, unit })
          : null;
  const trend =
    weight.trend === null
      ? t("body__no_data")
      : t("body__value", {
          value: formatBodyWeight(weight.trend, weight.unit, i18n.language),
          unit,
        });
  const spark = weight.series.slice(-SPARK_DAYS).map((point) => point.trend);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${t("body__weight_trend")}, ${trend}`}
      onPress={() => router.push("/body/weight")}
      className="gap-1 rounded-2xl bg-surface p-4 active:bg-default"
    >
      <Text className="text-caption text-muted">{t("body__weight_trend")}</Text>
      <View className="flex-row items-center justify-between gap-3">
        <Text className="text-numeric-md tabular-nums text-foreground">{trend}</Text>
        {spark.length > 1 ? <Sparkline values={spark} /> : null}
      </View>
      {line ? <Text className="text-caption tabular-nums text-muted">{line}</Text> : null}
    </Pressable>
  );
}
