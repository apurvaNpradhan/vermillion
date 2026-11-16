import { CaretLeft, CaretRight } from "phosphor-react-native";
import { Pressable, Text, View } from "react-native";

import { useTranslation } from "@/platform/i18n";
import { useSubtleColor } from "@/platform/theme";

import { weekDays, type WeekStart } from "@workspace/shared";

import { monthCells, shiftMonth, type Month } from "./history-calendar";

const SUNDAY = Date.UTC(2026, 0, 4); // a Sunday, the base of the weekday letters

/**
 * A compact month: one square per day in the Habit grid's style, the days with a Session filled
 * with the accent. Arrows move between months (never past `latest`); tapping a trained day
 * selects it, tapping it again clears it. `counts` maps a date to its Session count.
 */
export function HistoryCalendar({
  month,
  latest,
  counts,
  total,
  selected,
  weekStart,
  onMonthChange,
  onSelect,
}: {
  month: Month;
  latest: Month;
  counts: ReadonlyMap<string, number>;
  total: number;
  selected: string | null;
  weekStart: WeekStart;
  onMonthChange: (month: Month) => void;
  onSelect: (date: string | null) => void;
}) {
  const { t, i18n } = useTranslation();
  const subtle = useSubtleColor();
  const cells = monthCells(month, counts, weekStart);
  const rows = Array.from({ length: Math.ceil(cells.length / 7) }, (_, row) =>
    cells.slice(row * 7, row * 7 + 7),
  );
  const format = (options: Intl.DateTimeFormatOptions, at: number) =>
    new Intl.DateTimeFormat(i18n.language, { timeZone: "UTC", ...options }).format(at);
  const atLatest = month.year * 12 + month.month >= latest.year * 12 + latest.month;
  return (
    <View className="gap-3 rounded-2xl bg-surface p-4">
      <View className="flex-row items-center justify-between gap-3">
        <View className="min-w-0 flex-1">
          <Text accessibilityRole="header" className="text-title-md font-semibold text-foreground">
            {format({ month: "long", year: "numeric" }, Date.UTC(month.year, month.month, 1))}
          </Text>
          <Text className="text-caption tabular-nums text-muted">
            {t("stats__sessions", { count: total })}
          </Text>
        </View>
        <View className="flex-row gap-1">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("session__month_previous")}
            hitSlop={6}
            onPress={() => onMonthChange(shiftMonth(month, -1))}
            className="h-9 w-9 items-center justify-center rounded-full bg-default active:opacity-60"
          >
            <CaretLeft size={16} color={subtle} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("session__month_next")}
            accessibilityState={{ disabled: atLatest }}
            disabled={atLatest}
            hitSlop={6}
            onPress={() => onMonthChange(shiftMonth(month, 1))}
            className={`h-9 w-9 items-center justify-center rounded-full bg-default active:opacity-60 ${atLatest ? "opacity-40" : ""}`}
          >
            <CaretRight size={16} color={subtle} />
          </Pressable>
        </View>
      </View>
      <View className="flex-row gap-1">
        {weekDays(weekStart).map((weekday) => (
          <Text key={weekday} className="flex-1 text-center text-caption text-muted">
            {format({ weekday: "narrow" }, SUNDAY + weekday * 86_400_000)}
          </Text>
        ))}
      </View>
      <View className="gap-1">
        {rows.map((row, rowIndex) => (
          <View key={rowIndex} className="flex-row gap-1">
            {Array.from({ length: 7 }, (_, column) => {
              const cell = row[column];
              if (!cell || cell.kind === "blank")
                return <View key={column} className="h-7 flex-1" />;
              if (cell.sessions === 0)
                return <View key={column} className="h-7 flex-1 rounded-sm bg-default" />;
              const isSelected = selected === cell.date;
              return (
                <Pressable
                  key={column}
                  accessibilityRole="button"
                  accessibilityLabel={t("session__calendar_day", {
                    date: format({ dateStyle: "full" }, Date.parse(`${cell.date}T12:00:00Z`)),
                    count: cell.sessions,
                  })}
                  accessibilityState={{ selected: isSelected }}
                  onPress={() => onSelect(isSelected ? null : cell.date)}
                  className={`h-7 flex-1 rounded-sm bg-identity active:opacity-70 ${isSelected ? "border-2 border-foreground" : ""}`}
                />
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}
