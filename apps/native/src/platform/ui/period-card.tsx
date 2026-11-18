import { CaretLeft, CaretRight } from "phosphor-react-native";
import { useLayoutEffect, type ReactNode } from "react";
import { Text, View } from "react-native";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { useSubtleColor } from "@/platform/theme";

import { Button } from "./button";

/**
 * A card for one period of time, in the shape of History's: an overline title, a headline, previous
 * and next buttons, and its content, which slide in the direction of travel when `period` changes
 * (a fade under Reduce Motion). A horizontal swipe on the card steps too. Strings come from the
 * caller; the headline is any node, usually a number with its unit.
 */
export function PeriodCard({
  title,
  headline,
  period,
  direction,
  canPrevious,
  canNext,
  previousLabel,
  nextLabel,
  onMove,
  children,
}: {
  title: string;
  headline: ReactNode;
  /** Any value that changes with the period shown; a change plays the slide. */
  period: string | number;
  direction: -1 | 0 | 1;
  canPrevious: boolean;
  canNext: boolean;
  previousLabel: string;
  nextLabel: string;
  onMove: (step: -1 | 1) => void;
  children: ReactNode;
}) {
  const subtle = useSubtleColor();
  const reduced = useReducedMotion();
  const offset = useSharedValue(0);
  const opacity = useSharedValue(1);
  useLayoutEffect(() => {
    if (direction === 0) return;
    if (reduced) {
      opacity.set(0);
      opacity.set(withTiming(1, { duration: 120, reduceMotion: ReduceMotion.Never }));
    } else {
      offset.set(direction * 48);
      offset.set(withTiming(0, { duration: 170, easing: Easing.out(Easing.cubic) }));
    }
  }, [period, direction, reduced, offset, opacity]);
  const slide = useAnimatedStyle(() => ({
    opacity: opacity.get(),
    transform: [{ translateX: offset.get() }],
  }));
  const pan = usePanGesture({
    enabled: canPrevious || canNext,
    activeOffsetX: [-20, 20],
    failOffsetY: [-12, 12],
    onDeactivate: (event) => {
      if (event.canceled) return;
      if (event.translationX <= -40 && canNext) scheduleOnRN(onMove, 1);
      if (event.translationX >= 40 && canPrevious) scheduleOnRN(onMove, -1);
    },
  });
  return (
    <GestureDetector gesture={pan}>
      <View className="gap-4 overflow-hidden rounded-2xl bg-surface p-3">
        <View className="flex-row items-center justify-between gap-1">
          <View className="min-w-0 flex-1">
            <Animated.View style={slide}>
              <Text
                accessibilityRole="header"
                className="text-overline font-semibold uppercase text-muted"
              >
                {title}
              </Text>
            </Animated.View>
            {headline}
          </View>
          <View className="flex-row">
            <Button
              isIconOnly
              variant="ghost"
              accessibilityLabel={previousLabel}
              isDisabled={!canPrevious}
              onPress={() => onMove(-1)}
            >
              <CaretLeft size={20} weight="regular" color={subtle} />
            </Button>
            <Button
              isIconOnly
              variant="ghost"
              accessibilityLabel={nextLabel}
              isDisabled={!canNext}
              onPress={() => onMove(1)}
            >
              <CaretRight size={20} weight="regular" color={subtle} />
            </Button>
          </View>
        </View>
        <Animated.View style={slide}>{children}</Animated.View>
      </View>
    </GestureDetector>
  );
}
