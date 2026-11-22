/**
 * Source: PanelUI Calendar (panelui-native 1.4.0, MIT, https://panelui.dev).
 * Copyright (c) 2026 Khalid Abdi. See THIRD_PARTY_NOTICES.md.
 * Keeps the caption, paging and fixed six-week grid in single-date mode. Uses role
 * classes, Phosphor icons, caller-supplied strings and Gregorian UTC calendar-day values.
 */
import type { WeekStart } from "@workspace/shared";
import { CaretLeft, CaretRight } from "phosphor-react-native";
import { Pressable, Text, View } from "react-native";

import { useSubtleColor } from "@/platform/theme";

import { Button } from "./button";
import { calendarGrid, calendarMonth, calendarPage } from "./calendar-math";

export function Calendar({
  month,
  selected,
  min,
  today,
  weekStart,
  labels,
  onSelect,
  onMonthChange,
}: {
  month: number;
  selected: number;
  min: number;
  today: number;
  weekStart: WeekStart;
  labels: {
    month: (day: number) => string;
    weekday: (day: number) => string;
    day: (day: number) => string;
    date: (day: number) => string;
    previous: string;
    next: string;
  };
  onSelect: (day: number) => void;
  onMonthChange: (month: number) => void;
}) {
  const subtle = useSubtleColor();
  const previous = calendarPage(month, -1, min, today);
  const next = calendarPage(month, 1, min, today);
  const rows = calendarGrid(month, weekStart);

  return (
    <View className="gap-1 rounded-2xl bg-surface p-2">
      <View className="flex-row items-center justify-between gap-2">
        <Button
          isIconOnly
          variant="ghost"
          accessibilityLabel={labels.previous}
          isDisabled={previous === null}
          onPress={() => previous !== null && onMonthChange(previous)}
        >
          <CaretLeft size={20} weight="regular" color={subtle} />
        </Button>
        <Text
          accessibilityRole="header"
          className="flex-1 text-center text-body font-semibold text-foreground"
        >
          {labels.month(month)}
        </Text>
        <Button
          isIconOnly
          variant="ghost"
          accessibilityLabel={labels.next}
          isDisabled={next === null}
          onPress={() => next !== null && onMonthChange(next)}
        >
          <CaretRight size={20} weight="regular" color={subtle} />
        </Button>
      </View>
      <View
        className="flex-row gap-1"
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
      >
        {rows[0]?.map((day) => (
          <Text key={day} className="font-normal flex-1 text-center text-caption text-muted">
            {labels.weekday(day)}
          </Text>
        ))}
      </View>
      {rows.map((row) => (
        <View key={row[0]} className="flex-row gap-1">
          {row.map((day) => {
            const outside = calendarMonth(day) !== month;
            const disabled = day < min || day > today;
            const active = selected === day;
            if (outside) {
              return <View className="min-h-11 flex-1" key={day} />;
            }
            return (
              <Pressable
                key={day}
                accessibilityRole="button"
                accessibilityLabel={labels.date(day)}
                accessibilityState={{ selected: active, disabled }}
                disabled={disabled}
                onPress={() => onSelect(day)}
                className={`min-h-11 flex-1 items-center justify-center rounded-lg bg-default active:opacity-70
                  ${active ? "bg-accent" : ""}
                  ${day === today ? "border border-identity" : ""}
                  ${disabled ? "opacity-40" : ""}`}
              >
                <Text
                  className={`font-medium text-numeric-sm tabular-nums ${active ? "text-accent-foreground" : "text-foreground"}`}
                >
                  {labels.day(day)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}
