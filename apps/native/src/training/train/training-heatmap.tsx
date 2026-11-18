import { useMemo } from "react";
import { Text, View } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { HeatmapChart } from "@/platform/ui/heatmap-chart";

import type { useTrainingHeatmap } from "./use-training-heatmap";

/** The last 26 weeks of training as a grid shaded by Counted sets a day; long-press to read a day. */
export function TrainingHeatmap({ data }: { data: ReturnType<typeof useTrainingHeatmap> }) {
  const { t, i18n } = useTranslation();
  const labels = useMemo(() => {
    const month = new Intl.DateTimeFormat(i18n.language, { month: "short", timeZone: "UTC" });
    const date = new Intl.DateTimeFormat(i18n.language, {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });
    return {
      summary: t("training__heatmap_summary", {
        sets: data.totals.sets,
        days: data.totals.days,
      }),
      month: (day: number) => month.format(day),
      cell: (bin: { day: number; count: number }) =>
        t("training__heatmap_cell", {
          date: date.format(bin.day),
          sets: t("stats__sets", { count: bin.count }),
        }),
    };
  }, [t, i18n.language, data.totals.sets, data.totals.days]);
  return (
    <View className="gap-3 rounded-2xl bg-surface p-4">
      <Text accessibilityRole="header" className="text-title-md font-semibold text-foreground">
        {t("training__heatmap_title")}
      </Text>
      <HeatmapChart columns={data.columns} labels={labels} />
    </View>
  );
}
