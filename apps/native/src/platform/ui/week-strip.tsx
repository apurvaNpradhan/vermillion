/**
 * Source: PanelUI WeekStrip (panelui-native 1.4.0, MIT, https://panelui.dev).
 * Copyright (c) 2026 Khalid Abdi. See THIRD_PARTY_NOTICES.md.
 * Keeps the row of seven day columns with a weekday over its number, marks beneath it, a ringed
 * today and faded or disabled days. Changes: UTC calendar-day numbers instead of `Date`s, role
 * classes (`success`, `identity`, `muted`) instead of the library's tones, a hollow dot for a
 * planned day, no scrolling layout, no `tailwind-variants`, and every string from the caller.
 */
import { Pressable, Text, View } from "react-native";

/** The colour of a mark: done, "you / now", or quiet. */
export type WeekStripTone = "success" | "identity" | "muted";

export type WeekStripMarks = {
  /** Up to three filled dots, one per kind of thing on the day. */
  dots?: readonly WeekStripTone[];
  /** A hollow dot for something planned on the day. */
  planned?: boolean;
  /** Spoken after the date, e.g. "trained". */
  label?: string;
};

const TONE = {
  success: "bg-success",
  identity: "bg-identity",
  muted: "bg-muted",
} as const satisfies Record<WeekStripTone, string>;

export function WeekStrip({
  days,
  today,
  marks,
  faded,
  disabled,
  labels,
  onSelect,
}: {
  /** The days to show (UTC calendar-day numbers), oldest first. */
  days: readonly number[];
  today: number;
  marks?: (day: number) => WeekStripMarks | undefined;
  /** Faded but still pressable, such as a day that has not happened. */
  faded?: (day: number) => boolean;
  /** Faded and not pressable. */
  disabled?: (day: number) => boolean;
  labels: {
    weekday: (day: number) => string;
    day: (day: number) => string;
    date: (day: number) => string;
  };
  onSelect?: (day: number) => void;
}) {
  return (
    <View className="w-full flex-row gap-1 self-stretch">
      {days.map((day) => {
        const mark = marks?.(day);
        const off = disabled?.(day) ?? false;
        const dim = off || (faded?.(day) ?? false);
        const dots = (mark?.dots ?? []).slice(0, 3);
        return (
          <Pressable
            key={day}
            accessibilityRole="button"
            accessibilityLabel={[labels.date(day), mark?.label].filter(Boolean).join(", ")}
            accessibilityState={{ disabled: off || onSelect === undefined }}
            disabled={off || onSelect === undefined}
            onPress={() => onSelect?.(day)}
            className={`min-h-[68px] flex-1 items-center gap-1 rounded-2xl border py-2 active:bg-default ${
              day === today ? "border-identity bg-default" : "border-transparent"
            } ${dim ? "opacity-40" : ""}`}
          >
            <Text numberOfLines={1} className="text-caption font-medium text-muted">
              {labels.weekday(day)}
            </Text>
            <Text className="text-numeric-sm tabular-nums text-foreground">{labels.day(day)}</Text>
            <View className="h-2 flex-row items-center justify-center gap-1">
              {dots.map((tone, index) => (
                <View key={index} className={`h-1.5 w-1.5 rounded-full ${TONE[tone]}`} />
              ))}
              {mark?.planned ? (
                <View className="h-1.5 w-1.5 rounded-full border border-identity" />
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
