/**
 * Source: PanelUI WeekStrip (panelui-native 1.4.0, MIT, https://panelui.dev).
 * Copyright (c) 2026 Khalid Abdi. See THIRD_PARTY_NOTICES.md.
 * Keeps the row of seven day columns with a weekday over its number, marks beneath it, a ringed
 * today and faded or disabled days. Changes: UTC calendar-day numbers instead of `Date`s, role
 * classes (`success`, `identity`, `muted`) instead of the library's tones, a hollow dot for a
 * planned day, no scrolling layout, no `tailwind-variants`, and every string from the caller.
 */
import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { columnOffset, columnWidth } from "./week-strip-math";

/** Gap between columns, matching `gap-1`. */
const GAP = 4;
const SLIDE_MS = 200;

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
  selected = today,
  marks,
  faded,
  disabled,
  pressable,
  labels,
  onSelect,
}: {
  /** The days to show (UTC calendar-day numbers), oldest first. */
  days: readonly number[];
  today: number;
  /** The day the highlight sits on; it slides when this changes. Today, by default. */
  selected?: number;
  marks?: (day: number) => WeekStripMarks | undefined;
  /** Faded but still pressable, such as a day that has not happened. */
  faded?: (day: number) => boolean;
  /** Faded and not pressable. */
  disabled?: (day: number) => boolean;
  /** Which days respond to a press; the rest stay as they look. Everything, by default. */
  pressable?: (day: number) => boolean;
  labels: {
    weekday: (day: number) => string;
    day: (day: number) => string;
    date: (day: number) => string;
    /** Spoken before today's date, e.g. "Today". */
    today: string;
  };
  onSelect?: (day: number) => void;
}) {
  const [width, setWidth] = useState(0);
  const reduced = useReducedMotion();
  const index = days.indexOf(selected);
  const column = columnWidth(days.length, width, GAP);
  const offset = useSharedValue(columnOffset(index, days.length, width, GAP));
  const placed = useRef(false);
  useEffect(() => {
    const target = columnOffset(index, days.length, width, GAP);
    // The first measurement and Reduce Motion place the highlight without a slide.
    const first = !placed.current;
    placed.current = width > 0;
    offset.value =
      reduced || first
        ? target
        : withTiming(target, {
            duration: SLIDE_MS,
            easing: Easing.out(Easing.cubic),
            reduceMotion: ReduceMotion.Never,
          });
  }, [index, days.length, width, reduced, offset]);
  const highlight = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }));
  return (
    <View
      className="w-full flex-row gap-1 self-stretch"
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      {index >= 0 && width > 0 ? (
        <Animated.View
          pointerEvents="none"
          className="absolute inset-y-0 left-0 rounded-2xl border border-identity bg-default"
          style={[{ width: column }, highlight]}
        />
      ) : null}
      {days.map((day) => {
        const mark = marks?.(day);
        const off = disabled?.(day) ?? false;
        const dim = off || (faded?.(day) ?? false);
        const inert = off || onSelect === undefined || pressable?.(day) === false;
        const dots = (mark?.dots ?? []).slice(0, 3);
        return (
          <Pressable
            key={day}
            accessibilityRole="button"
            accessibilityLabel={[
              day === today ? labels.today : undefined,
              labels.date(day),
              mark?.label,
            ]
              .filter(Boolean)
              .join(", ")}
            accessibilityState={{ disabled: inert }}
            disabled={inert}
            onPress={() => onSelect?.(day)}
            className={`min-h-[68px] flex-1 items-center gap-1 rounded-2xl border border-transparent py-2 active:bg-default ${dim ? "opacity-40" : ""}`}
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
