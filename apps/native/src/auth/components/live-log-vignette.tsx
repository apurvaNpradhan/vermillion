import { Check } from "phosphor-react-native";
import { memo, useEffect } from "react";
import { Text, View, type TextStyle } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

import { useOnActionColor, useSubtleColor } from "@/platform/theme";
import { useReduceMotion } from "@/platform/ui/use-reduce-motion";

import {
  CYCLE_MS,
  FINAL_MS,
  REPS,
  ROW_COUNT,
  formatWeight,
  stepProgress,
  tickProgress,
  weightOf,
} from "./live-log-math";

/** The completed-row tint, the same 15% accent the live log uses. */
const TINT_OPACITY = 0.15;
const TABULAR: TextStyle = { fontVariant: ["tabular-nums"] };

const INDEXES = Array.from({ length: ROW_COUNT }, (_, index) => index);

/**
 * A small decorative vignette of the live log for the welcome screen: four set rows tick one after
 * another; each tick tints the row, fills the check with the accent and steps the next row's
 * weight up. One shared clock drives every row on the UI thread. Under Reduce Motion it rests on
 * the finished state. Hidden from screen readers: the title and tagline say it in words.
 */
export function LiveLogVignette() {
  const reduceMotion = useReduceMotion();
  const clock = useSharedValue(FINAL_MS);

  useEffect(() => {
    if (reduceMotion) {
      cancelAnimation(clock);
      clock.value = FINAL_MS;
      return;
    }
    clock.value = 0;
    clock.value = withRepeat(
      withTiming(CYCLE_MS, { duration: CYCLE_MS, easing: Easing.linear }),
      -1,
      false,
    );
    return () => cancelAnimation(clock);
  }, [clock, reduceMotion]);

  return (
    <View
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="gap-1.5"
    >
      {INDEXES.map((index) => (
        <VignetteRow key={index} index={index} clock={clock} />
      ))}
    </View>
  );
}

const VignetteRow = memo(function VignetteRow({
  index,
  clock,
}: {
  index: number;
  clock: SharedValue<number>;
}) {
  const subtle = useSubtleColor();
  const onAccent = useOnActionColor();

  const tint = useAnimatedStyle(() => ({
    opacity: TINT_OPACITY * tickProgress(index, clock.value),
  }));
  const fill = useAnimatedStyle(() => {
    const done = tickProgress(index, clock.value);
    return { opacity: done, transform: [{ scale: 0.85 + 0.15 * done }] };
  });
  const outline = useAnimatedStyle(() => ({ opacity: 1 - tickProgress(index, clock.value) }));
  // The weight carried down from the row above fades up and out as the new one rises in.
  const before = useAnimatedStyle(() => {
    const step = stepProgress(index, clock.value);
    return { opacity: 1 - step, transform: [{ translateY: -6 * step }] };
  });
  const after = useAnimatedStyle(() => {
    const step = stepProgress(index, clock.value);
    return { opacity: step, transform: [{ translateY: 6 * (1 - step) }] };
  });

  const from = weightOf(Math.max(0, index - 1));

  return (
    <View className="h-14 flex-row items-center overflow-hidden rounded-2xl bg-surface pr-3 pl-4">
      <Animated.View className="absolute inset-0 bg-accent" style={tint} />
      <Text className="w-8 font-mono text-body text-muted" style={TABULAR}>
        {index + 1}
      </Text>
      <View className="h-7 flex-1 justify-center">
        <Animated.View className="absolute" style={before}>
          <Text className="font-mono-medium text-title-md text-foreground" style={TABULAR}>
            {`${formatWeight(from)} kg × ${REPS}`}
          </Text>
        </Animated.View>
        <Animated.View className="absolute" style={after}>
          <Text className="font-mono-medium text-title-md text-foreground" style={TABULAR}>
            {`${formatWeight(weightOf(index))} kg × ${REPS}`}
          </Text>
        </Animated.View>
      </View>
      <View className="h-7 w-7 items-center justify-center">
        <Animated.View className="absolute inset-0 items-center justify-center" style={outline}>
          <Check size={22} weight="regular" color={subtle} />
        </Animated.View>
        <Animated.View
          className="absolute inset-0 items-center justify-center rounded-lg bg-accent"
          style={fill}
        >
          <Check size={18} weight="bold" color={onAccent} />
        </Animated.View>
      </View>
    </View>
  );
});
