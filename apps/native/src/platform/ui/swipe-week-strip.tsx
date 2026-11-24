import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import Animated from "react-native-reanimated";

import { useSlideSwipe } from "./use-slide-swipe";

/**
 * The header and swipe behaviour of a week strip, shared by Home and History: a month label that
 * jumps to today when pressed, and content (the strip, or a month calendar) that a horizontal
 * swipe steps through and that slides in the direction of travel. `onVertical` reports a long
 * vertical drag on it (History pulls down for the month). Screen readers step through the
 * period with the label's increment and decrement actions. Strings come from the caller.
 */
export function SwipeWeekStrip({
  title,
  jumpLabel,
  previousLabel,
  nextLabel,
  period,
  direction,
  canPrevious = true,
  canNext,
  onJump,
  onMove,
  onVertical,
  accessory,
  children,
}: {
  /** "November 2026". */
  title: string;
  /** Spoken for the label's press: "Jump to today". */
  jumpLabel: string;
  previousLabel: string;
  nextLabel: string;
  /** Any value that changes with the period shown; a change plays the slide. */
  period: string | number;
  direction: -1 | 0 | 1;
  canPrevious?: boolean;
  canNext: boolean;
  onJump: () => void;
  onMove: (step: -1 | 1) => void;
  onVertical?: (step: -1 | 1) => void;
  /** Sits at the end of the label row (History's expand handle). */
  accessory?: ReactNode;
  children: ReactNode;
}) {
  const { pan, slide } = useSlideSwipe({
    period,
    direction,
    canPrevious,
    canNext,
    onMove,
    onVertical,
  });
  return (
    <View className="gap-1">
      <View className="min-h-11 flex-row items-center justify-between gap-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${title}. ${jumpLabel}`}
          accessibilityActions={[
            { name: "decrement", label: previousLabel },
            { name: "increment", label: nextLabel },
          ]}
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === "decrement" && canPrevious) onMove(-1);
            if (event.nativeEvent.actionName === "increment" && canNext) onMove(1);
          }}
          onPress={onJump}
          className="min-h-11 flex-1 justify-center active:opacity-70"
        >
          <Text numberOfLines={1} className="text-title-md font-semibold text-foreground">
            {title}
          </Text>
        </Pressable>
        {accessory}
      </View>
      <GestureDetector gesture={pan}>
        <Animated.View style={slide}>{children}</Animated.View>
      </GestureDetector>
    </View>
  );
}
