import { useMemo } from "react";
import { Text, View } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { HeatmapChart } from "@/platform/ui/heatmap-chart";
import { heatmapColumns } from "@/platform/ui/heatmap-chart-math";
import type { WeekStart } from "@workspace/shared";

import { weighInCounts } from "./weigh-in-days";

/** Weeks of weigh-ins the grid shows. */
const WEEKS = 26;

/** The last 26 weeks as a grid: a day is filled when it has a weigh-in. Long-press to read a day. */
export function WeighInHeatmap({
  entries,
  today,
  weekStart,
}: {
  entries: readonly { local_date: string }[];
  /** The user's local date, `YYYY-MM-DD`. */
  today: string;
  weekStart: WeekStart;
}) {
  const { t, i18n } = useTranslation();
  const counts = useMemo(() => weighInCounts(entries), [entries]);
  const columns = useMemo(
    () => heatmapColumns({ counts, end: Date.parse(today), weeks: WEEKS, weekStart }),
    [counts, today, weekStart],
  );
  const labels = useMemo(() => {
    const month = new Intl.DateTimeFormat(i18n.language, { month: "short", timeZone: "UTC" });
    const date = new Intl.DateTimeFormat(i18n.language, {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });
    const first = columns[0]?.bins[0]?.day ?? 0;
    const weighed = [...counts.keys()].filter((day) => day >= first).length;
    return {
      summary: t("body__heatmap_summary", { count: weighed }),
      month: (day: number) => month.format(day),
      cell: (bin: { day: number; count: number }) =>
        t(bin.count > 0 ? "body__heatmap_weighed" : "body__heatmap_missed", {
          date: date.format(bin.day),
        }),
    };
  }, [columns, counts, t, i18n.language]);
  return (
    <View className="gap-3 rounded-2xl bg-surface p-4">
      <Text accessibilityRole="header" className="text-title-md font-semibold text-foreground">
        {t("body__heatmap_title")}
      </Text>
      <HeatmapChart columns={columns} tone="chart-2" binary labels={labels} />
    </View>
  );
}
