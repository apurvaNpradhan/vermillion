import type { WeekStart } from "@workspace/shared";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useEffect } from "react";
import Animated, {
  ReduceMotion,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle, Rect } from "react-native-svg";
import { useCSSVariable } from "uniwind";

import { useTranslation } from "@/platform/i18n";
import { isColorString, useIdentityColor } from "@/platform/theme";
import { StatTiles } from "@/platform/ui/stat-tiles";

import {
  DAY_MS,
  WEEK_MS,
  emptyTotals,
  goalStreaks,
  monthRows,
  monthlyWorkouts,
  shiftPeriod,
  yearGoal,
  type History,
  type Totals,
} from "./history-calendar";
import { DayFill } from "./history-calendar-view";
import type { HistoryFormat } from "./history-format";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const SIZE = 60;
const RADIUS = 27;
const CIRCUMFERENCE = Math.PI * 2 * RADIUS;
const BAR_STEP = 32;
const BAR_HEIGHT = 76;

export function HistoryWeek({
  start,
  today,
  history,
  goal,
  format,
}: {
  start: number;
  today: number;
  history: History;
  goal: number | null;
  format: HistoryFormat;
}) {
  const { t } = useTranslation();
  const totals = history.byWeek.get(start)?.totals ?? emptyTotals;
  const previous = history.byWeek.get(start - WEEK_MS)?.totals ?? emptyTotals;
  const vs = (difference: number) =>
    t("session__vs_previous_week", { value: format.delta(difference) });
  const minutes = (stats: Totals) => Math.round(stats.seconds / 60);
  const volume = (stats: Totals) => format.volumeValue(stats.volume);

  return (
    <View className="gap-4">
      <View className="flex-row gap-1">
        {Array.from({ length: 7 }, (_, index) => {
          const day = start + index * DAY_MS;
          const sessions = history.byDay.get(day) ?? [];
          const title = sessions[0]?.title;
          const trained = sessions.length > 0;
          const tone = trained ? "text-on-identity" : "text-muted";
          return (
            <View
              key={index}
              accessible
              accessibilityLabel={
                title
                  ? t("session__calendar_day_title", {
                      date: format.full(day),
                      count: sessions.length,
                      title,
                    })
                  : format.full(day)
              }
              className={`min-h-28 flex-1 overflow-hidden rounded-lg bg-default px-0.5 py-2 ${day > today ? "opacity-45" : ""}`}
            >
              <DayFill trained={trained} />
              {day === today && (
                <View
                  pointerEvents="none"
                  className={`absolute inset-0 rounded-lg border ${trained ? "border-on-identity" : "border-identity"}`}
                />
              )}
              <Text className={`text-center text-caption ${tone}`}>
                {format.weekdayLetter(day)}
              </Text>
              <Text
                className={`text-center text-numeric-md tabular-nums ${trained ? "text-on-identity" : "text-foreground"}`}
              >
                {format.day(day)}
              </Text>
              {title && (
                <Text numberOfLines={2} className={`mt-auto text-center text-overline ${tone}`}>
                  {title}
                </Text>
              )}
            </View>
          );
        })}
      </View>
      {goal !== null && (
        <View className="flex-row items-center gap-3">
          <GoalRing count={totals.workouts} goal={goal} format={format} />
          <Text className="text-body text-muted">{t("session__weekly_goal")}</Text>
        </View>
      )}
      <StatTiles
        items={[
          {
            label: t("stats__sets"),
            value: format.integer(totals.sets),
            detail: vs(totals.sets - previous.sets),
          },
          {
            label: t("stats__volume"),
            value: t("home__volume_value", {
              value: format.decimal(volume(totals)),
              unit: t(format.volumeUnit),
            }),
            detail: vs(volume(totals) - volume(previous)),
          },
          {
            label: t("stats__duration"),
            value: t("session__duration_min", { value: format.integer(minutes(totals)) }),
            detail: vs(minutes(totals) - minutes(previous)),
          },
        ]}
      />
    </View>
  );
}

function GoalRing({ count, goal, format }: { count: number; goal: number; format: HistoryFormat }) {
  const { t } = useTranslation();
  const track = useCSSVariable("--color-default");
  const fill = useIdentityColor();
  const fraction = Math.min(1, count / goal);
  const reduced = useReducedMotion();
  // Reduce Motion: the final arc fades in over 120 ms (as the period card does) instead of filling.
  const opacity = useSharedValue(reduced ? 0 : 1);
  useEffect(() => {
    if (reduced) {
      opacity.set(0);
      opacity.set(withTiming(1, { duration: 120, reduceMotion: ReduceMotion.Never }));
    } else {
      opacity.set(1);
    }
  }, [reduced, opacity]);
  const animated = useAnimatedProps(() => ({
    strokeDashoffset: reduced
      ? CIRCUMFERENCE * (1 - fraction)
      : withTiming(CIRCUMFERENCE * (1 - fraction), { duration: 320 }),
    opacity: opacity.get(),
  }));
  return (
    <View
      accessible
      accessibilityLabel={t("session__goal_accessible", { count, goal })}
      className="size-[60px] items-center justify-center"
    >
      <Svg width={SIZE} height={SIZE} className="absolute" accessible={false}>
        <Circle
          cx={30}
          cy={30}
          r={RADIUS}
          fill="none"
          stroke={isColorString(track) ? track : undefined}
          strokeWidth={4}
        />
        <AnimatedCircle
          cx={30}
          cy={30}
          r={RADIUS}
          fill="none"
          stroke={fill}
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={[CIRCUMFERENCE, CIRCUMFERENCE]}
          animatedProps={animated}
          rotation={-90}
          originX={30}
          originY={30}
        />
      </Svg>
      <Text className="text-label tabular-nums text-foreground">
        {t("session__goal_ratio", { done: format.integer(count), goal: format.integer(goal) })}
      </Text>
    </View>
  );
}

export function HistoryYear({
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
            const days = monthRows(month, weekStart);
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
                <View className="gap-0.5">
                  {Array.from({ length: 6 }, (_, rowIndex) => (
                    <View key={rowIndex} className="flex-row gap-0.5">
                      {Array.from({ length: 7 }, (_, colIndex) => {
                        const day = days[rowIndex]?.days[colIndex];
                        const tone =
                          day == null || day > today
                            ? "opacity-0"
                            : history.byDay.has(day)
                              ? "bg-identity"
                              : "bg-muted/30";
                        return <View key={colIndex} className={`size-1.5 rounded-full ${tone}`} />;
                      })}
                    </View>
                  ))}
                </View>
                <Text numberOfLines={1} className="text-caption tabular-nums text-muted">
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

export function HistoryAll({
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
                      <Text className="text-overline tabular-nums text-muted">
                        {format.integer(count)}
                      </Text>
                      <Text className="text-overline text-muted">{format.shortMonth(month)}</Text>
                    </View>
                  ))}
                </View>
                <Text className="text-label tabular-nums text-foreground">
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
