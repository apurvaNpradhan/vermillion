import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, withTiming } from "react-native-reanimated";

import { haptic } from "@/platform/haptics";

import { indicatorOffset, indexOfValue, segmentWidth } from "./segmented-index";

export type SegmentedOption<T extends string> = { value: T; label: string };

const PAD = 2;
const FAST_MS = 120;

/**
 * Two to four options in one view: a `bg-default` track with a `bg-surface` pill under the chosen
 * one. The pill slides in `motion-fast` (instantly under Reduce Motion); `haptic-tick` on change.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
}: {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel: string;
}) {
  const [width, setWidth] = useState(0);
  const reduced = useReducedMotion();
  const inner = Math.max(width - PAD * 2, 0);
  const index = indexOfValue(options, value);
  // Plain numbers, worked out on the JS thread: the helpers are not worklets.
  const offset = indicatorOffset(index, inner, options.length);
  const pillWidth = segmentWidth(inner, options.length);
  const pill = useAnimatedStyle(() => ({
    width: pillWidth,
    transform: [{ translateX: reduced ? offset : withTiming(offset, { duration: FAST_MS }) }],
  }));

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      className="h-11 flex-row rounded-xl bg-default"
      style={{ padding: PAD }}
    >
      <Animated.View
        pointerEvents="none"
        className="absolute rounded-[10px] border border-border bg-surface"
        style={[{ top: PAD, bottom: PAD, left: PAD }, pill]}
      />
      {options.map((option) => (
        <Pressable
          key={option.value}
          accessibilityRole="radio"
          accessibilityState={{ checked: option.value === value }}
          accessibilityLabel={option.label}
          onPress={() => {
            if (option.value === value) return;
            haptic.tick();
            onChange(option.value);
          }}
          className="flex-1 items-center justify-center"
        >
          <Text
            className={`text-body font-medium ${option.value === value ? "text-foreground" : "text-muted"}`}
          >
            {option.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
