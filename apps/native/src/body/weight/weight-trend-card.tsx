import { changeOver, formatBodyWeight, shownWeight } from "@workspace/shared";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { Button } from "@/platform/ui/button";
import { Sparkline } from "@/platform/ui/charts/sparkline";
import { SummaryValue } from "@/platform/ui/summary-value";

import type { useWeight } from "./use-weight";
import { WeightLogSheet } from "./weight-log-sheet";
import { ANCHORED } from "@/platform/navigation/anchored";

/** Days of trend the sparkline draws. */
const SPARK_DAYS = 30;

/**
 * Home's Body block: the trend now, a bare sparkline of the last month, one muted line with this
 * week's change and the goal, and a Log button that opens the weigh-in sheet in place. Parts
 * without data are left out; the trend opens the Weight screen. It takes the weight state from its
 * screen so Home has one loading state.
 */
export function WeightTrendCard({ weight }: { weight: ReturnType<typeof useWeight> }) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const [logging, setLogging] = useState(false);
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
  const value = weight.trend === null ? null : formatBodyWeight(weight.trend, unit, i18n.language);
  const trend = value === null ? t("body__no_data") : t("body__value", { value, unit });
  const spark = weight.series.slice(-SPARK_DAYS).map((point) => point.trend);
  return (
    <View className="gap-3 rounded-xl bg-surface p-3.5">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${t("body__weight_trend")}, ${trend}`}
        onPress={() => router.push("/body/weight", ANCHORED)}
        className="gap-1 rounded-xl active:opacity-70"
      >
        <Text className="text-title-md font-semibold text-foreground">{t("body__title")}</Text>
        <View className="flex-row items-center justify-between gap-3">
          {value === null ? (
            <Text className="text-body text-muted">{trend}</Text>
          ) : (
            <SummaryValue value={value} unit={unit} />
          )}
          {spark.length > 1 ? (
            <View className="items-end">
              <Sparkline values={spark} />
              <Text className="text-caption text-muted">
                {t("body__days", { count: SPARK_DAYS })}
              </Text>
            </View>
          ) : null}
        </View>
        {line ? <Text className="text-caption tabular-nums text-muted">{line}</Text> : null}
      </Pressable>
      <Button variant="secondary" className="w-full" onPress={() => setLogging(true)}>
        <Button.Label>{t("body__log")}</Button.Label>
      </Button>
      {logging ? <WeightLogSheet onClose={() => setLogging(false)} /> : null}
    </View>
  );
}
