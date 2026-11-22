import type { WeekStart } from "@workspace/shared";
import { Check, Target } from "phosphor-react-native";
import { Pressable, Text, View } from "react-native";
import Animated, { ReduceMotion, useAnimatedStyle, withTiming } from "react-native-reanimated";

import { useTranslation } from "@/platform/i18n";
import { useOnActionColor, useSubtleColor } from "@/platform/theme";

import { DAY_MS, goalHit, monthRows, type History } from "./history-calendar";
import type { HistoryFormat } from "./history-format";

export function HistoryCalendar({
  month,
  today,
  selected,
  history,
  goal,
  weekStart,
  format,
  onSelect,
}: {
  month: number;
  today: number;
  selected: number | null;
  history: History;
  goal: number | null;
  weekStart: WeekStart;
  format: HistoryFormat;
  onSelect: (day: number | null) => void;
}) {
  const { t } = useTranslation();
  const subtle = useSubtleColor();
  const rows = monthRows(month, weekStart);
  const firstWeek = rows[0]?.week ?? month;
  return (
    <View className="gap-1">
      <View className="flex-row items-center gap-1 pb-1">
        {Array.from({ length: 7 }, (_, index) => {
          const day = firstWeek + index * DAY_MS;
          return (
            <Text key={day} className="font-normal flex-1 text-center text-caption text-muted">
              {format.weekdayLetter(day)}
            </Text>
          );
        })}
        {goal !== null && (
          <View
            accessible
            accessibilityLabel={t("session__weekly_goal")}
            className="w-10 items-center"
          >
            <Target size={20} weight="regular" color={subtle} />
          </View>
        )}
      </View>
      {rows.map(({ week, days }) => (
        <View key={week} className="flex-row items-center gap-1">
          {days.map((day, column) => {
            if (day === null) return <View key={column} className="min-h-11 flex-1" />;
            const count = history.byDay.get(day)?.length ?? 0;
            const active = selected === day;
            const disabled = day > today;
            return (
              <Pressable
                key={column}
                accessibilityRole="button"
                accessibilityLabel={t("session__calendar_day", { date: format.full(day), count })}
                accessibilityState={{ selected: active, disabled }}
                disabled={disabled}
                onPress={() => onSelect(active ? null : day)}
                className={`min-h-11 flex-1 items-center justify-center overflow-hidden rounded-lg bg-default active:opacity-70 ${disabled ? "opacity-45" : ""}`}
              >
                <DayFill trained={count > 0} />
                {day === today && (
                  <View
                    pointerEvents="none"
                    className={`absolute inset-1 rounded-md border ${count > 0 ? "border-accent-foreground" : "border-identity"}`}
                  />
                )}
                {active && (
                  <View
                    pointerEvents="none"
                    className="absolute inset-0 rounded-lg border-2 border-foreground"
                  />
                )}
                <Text
                  className={`font-medium text-numeric-sm tabular-nums ${count > 0 ? "text-accent-foreground" : "text-foreground"}`}
                >
                  {format.day(day)}
                </Text>
              </Pressable>
            );
          })}
          {goal !== null && (
            <MonthGoal
              count={history.weekCounts.get(week) ?? 0}
              goal={goal}
              future={week > today}
              format={format}
            />
          )}
        </View>
      ))}
    </View>
  );
}

export function DayFill({ trained }: { trained: boolean }) {
  const fill = useAnimatedStyle(() => ({
    opacity: withTiming(trained ? 1 : 0, { duration: 120, reduceMotion: ReduceMotion.Never }),
  }));
  return <Animated.View pointerEvents="none" className="absolute inset-0 bg-accent" style={fill} />;
}

function MonthGoal({
  count,
  goal,
  future,
  format,
}: {
  count: number;
  goal: number;
  future: boolean;
  format: HistoryFormat;
}) {
  const { t } = useTranslation();
  const onAction = useOnActionColor();
  const ratio = t("session__goal_ratio", {
    done: format.integer(count),
    goal: format.integer(goal),
  });
  return (
    <View
      accessible
      accessibilityLabel={t("session__goal_accessible", { count, goal })}
      className={`w-10 items-center justify-center ${future ? "opacity-45" : ""}`}
    >
      {goalHit(count, goal) ? (
        <View className="size-7 items-center justify-center rounded-full bg-accent">
          <Check size={20} weight="regular" color={onAction} />
        </View>
      ) : (
        <Text className="font-normal text-caption tabular-nums text-muted">{ratio}</Text>
      )}
    </View>
  );
}
