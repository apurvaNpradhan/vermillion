import type { WeekStart } from "@workspace/shared";
import { Pressable, ScrollView, Text, View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import { useCSSVariable } from "uniwind";

import { useTranslation } from "@/platform/i18n";
import { isColorString } from "@/platform/theme";
import { StatTiles } from "@/platform/ui/stat-tiles";

import {
  goalStreaks,
  monthRows,
  monthlyWorkouts,
  shiftPeriod,
  yearGoal,
  type History,
} from "@/session/history/history-calendar";
import type { HistoryFormat } from "@/session/history/history-format";

const BAR_STEP = 32;
const BAR_HEIGHT = 76;

function MonthActivity({
  month,
  today,
  weekStart,
  days,
}: {
  month: number;
  today: number;
  weekStart: WeekStart;
  days: History["byDay"];
}) {
  const ink = useCSSVariable("--color-accent-text");
  const muted = useCSSVariable("--muted");
  let trained = "";
  let rest = "";
  monthRows(month, weekStart).forEach((week, row) => {
    week.days.forEach((day, column) => {
      if (day === null || day > today) return;
      const dot = `M${column * 8} ${row * 8 + 3}a3 3 0 1 0 6 0a3 3 0 1 0 -6 0z`;
      if (days.has(day)) trained += dot;
      else rest += dot;
    });
  });
  return (
    <Svg width={54} height={46} accessible={false}>
      <Path d={rest} fill={isColorString(muted) ? muted : undefined} opacity={0.3} />
      <Path d={trained} fill={isColorString(ink) ? ink : undefined} />
    </Svg>
  );
}

export function ReportsYear({
  start,
  today,
  currentWeek,
  history,
  goal,
  weekStart,
  format,
  onMonth,
}: {
  start: number;
  today: number;
  currentWeek: number;
  history: History;
  goal: number | null;
  weekStart: WeekStart;
  format: HistoryFormat;
  onMonth: (month: number) => void;
}) {
  const { t } = useTranslation();
  const weeks = yearGoal(history.weekCounts, goal, start, weekStart, currentWeek);

  return (
    <View className="gap-3">
      {goal !== null && (
        <Text className="text-body font-medium tabular-nums text-foreground">
          {t("session__year_goal", {
            done: format.integer(weeks.reached),
            total: format.integer(weeks.total),
          })}
        </Text>
      )}
      {Array.from({ length: 4 }, (_, row) => (
        <View key={row} className="flex-row gap-2">
          {Array.from({ length: 3 }, (_, column) => {
            const month = shiftPeriod("month", start, row * 3 + column);
            const count = history.byMonth.get(month)?.totals.workouts ?? 0;
            const disabled = month > today;
            return (
              <Pressable
                key={month}
                accessibilityRole="button"
                accessibilityLabel={t("session__history_period_summary", {
                  period: format.monthYear(month),
                  workouts: t("session__workout_count", { count, value: format.integer(count) }),
                })}
                accessibilityState={{ disabled }}
                disabled={disabled}
                onPress={() => onMonth(month)}
                className={`min-w-0 flex-1 items-center gap-1 rounded-xl bg-default px-1 py-2 active:opacity-70 ${disabled ? "opacity-45" : ""}`}
              >
                <Text className="text-label font-medium text-foreground">
                  {format.shortMonth(month)}
                </Text>
                <MonthActivity
                  month={month}
                  today={today}
                  weekStart={weekStart}
                  days={history.byDay}
                />
                <Text
                  numberOfLines={1}
                  className="font-normal text-caption tabular-nums text-muted"
                >
                  {format.integer(count)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

export function ReportsAll({
  history,
  today,
  currentWeek,
  goal,
  weekStart,
  format,
  onYear,
}: {
  history: History;
  today: number;
  currentWeek: number;
  goal: number | null;
  weekStart: WeekStart;
  format: HistoryFormat;
  onYear: (year: number) => void;
}) {
  const { t } = useTranslation();
  const color = useCSSVariable("--color-chart-1");
  if (history.firstDay === null) return null;
  const { sets, volume, seconds } = history.totals;
  const streak = goalStreaks(history.weekCounts, goal, currentWeek);
  const months = monthlyWorkouts(history, today, weekStart);
  const years = new Map<number, typeof months>();
  let max = 1;
  for (const point of months) {
    const year = new Date(point.month).getUTCFullYear();
    const points = years.get(year) ?? [];
    points.push(point);
    years.set(year, points);
    max = Math.max(max, point.count);
  }
  const items = [
    { label: t("stats__sets"), value: format.integer(sets) },
    {
      label: t("stats__volume"),
      value: t("home__volume_value", {
        value: format.decimal(format.volumeValue(volume)),
        unit: t(format.volumeUnit),
      }),
    },
    {
      label: t("stats__duration"),
      value: t("session__duration_hours", { value: format.decimal(seconds / 3600) }),
    },
    { label: t("session__first_workout"), value: format.medium(history.firstDay) },
  ];
  if (goal !== null) {
    items.push({
      label: t("session__longest_streak"),
      value: t("session__streak_weeks", {
        count: streak.longest,
        value: format.integer(streak.longest),
      }),
    });
  }

  return (
    <View className="gap-4">
      <StatTiles items={items} />
      <View className="gap-1">
        <Text
          accessibilityRole="header"
          className="text-overline font-semibold uppercase text-muted"
        >
          {t("session__workouts_by_month")}
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator nestedScrollEnabled>
          {[...years].map(([year, points]) => {
            const yearStart = Date.UTC(year, 0, 1);
            const count = history.byYear.get(yearStart)?.totals.workouts ?? 0;
            return (
              <Pressable
                key={year}
                accessibilityRole="button"
                accessibilityLabel={t("session__history_year_summary", {
                  period: format.year(yearStart),
                  workouts: t("session__workout_count", { count, value: format.integer(count) }),
                  months: format.list(
                    points.map((point) =>
                      t("session__month_workout_count", {
                        month: format.longMonth(point.month),
                        count: point.count,
                        value: format.integer(point.count),
                      }),
                    ),
                  ),
                })}
                accessibilityHint={t("session__open_history_year")}
                onPress={() => onYear(yearStart)}
                className="items-center gap-1 rounded-lg px-2 py-2 active:bg-default"
              >
                <Svg width={points.length * BAR_STEP} height={BAR_HEIGHT} accessible={false}>
                  {points.map(({ month, count }, index) => {
                    const height = (count / max) * BAR_HEIGHT;
                    return (
                      <Rect
                        key={month}
                        x={index * BAR_STEP + 8}
                        y={BAR_HEIGHT - height}
                        width={16}
                        height={height}
                        rx={2}
                        fill={isColorString(color) ? color : undefined}
                      />
                    );
                  })}
                </Svg>
                <View
                  className="flex-row"
                  importantForAccessibility="no-hide-descendants"
                  accessibilityElementsHidden
                >
                  {points.map(({ month, count }) => (
                    <View key={month} style={{ width: BAR_STEP }} className="items-center">
                      <Text className="font-semibold text-overline tabular-nums text-muted">
                        {format.integer(count)}
                      </Text>
                      <Text className="font-semibold text-overline text-muted">
                        {format.shortMonth(month)}
                      </Text>
                    </View>
                  ))}
                </View>
                <Text className="font-medium text-label tabular-nums text-foreground">
                  {format.year(yearStart)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}
