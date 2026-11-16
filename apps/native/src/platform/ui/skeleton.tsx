/**
 * Source: PanelUI (panelui-native 1.2.0), `Skeleton`. MIT licence, https://github.com/panel-ui/PanelUI.
 * Changed: `bg-default` fill with soft corners; it stays invisible for `APPEAR_DELAY_MS` (local
 * data usually lands first, so most loads never show it), then fades in and breathes slowly
 * between two low opacities. It holds still under Reduce Motion.
 */
import { cn } from "heroui-native";
import { memo, useEffect } from "react";
import type { ViewProps } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

/** A load shorter than this shows no placeholder at all. */
const APPEAR_DELAY_MS = 350;
const FADE_IN_MS = 220;
/** One breath, each way: slow enough to read as calm rather than flicker. */
const BREATH_MS = 900;
const BREATH_HIGH = 0.7;
const BREATH_LOW = 0.4;
const RESTING_OPACITY = 0.55;

/** The delayed fade-in and breathing every placeholder shares. */
function useAppearing(): SharedValue<number> {
  const reduced = useReducedMotion();
  const opacity = useSharedValue(0);
  useEffect(() => {
    const fadeIn = { duration: FADE_IN_MS, easing: Easing.out(Easing.cubic) };
    opacity.value = withDelay(
      APPEAR_DELAY_MS,
      reduced
        ? withTiming(RESTING_OPACITY, fadeIn)
        : withSequence(
            withTiming(BREATH_HIGH, fadeIn),
            withRepeat(
              withTiming(BREATH_LOW, { duration: BREATH_MS, easing: Easing.inOut(Easing.sin) }),
              -1,
              true,
            ),
          ),
    );
    return () => cancelAnimation(opacity);
  }, [opacity, reduced]);
  return opacity;
}

export type SkeletonProps = {
  className?: string;
  style?: ViewProps["style"];
  /** Name the loading region for screen readers; put it on one skeleton per region only. */
  label?: string;
};

/** A soft `bg-default` placeholder that appears only for slow loads, then breathes. */
export const Skeleton = memo(function Skeleton({ className, style, label }: SkeletonProps) {
  const opacity = useAppearing();
  const animated = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const announced = label !== undefined;

  return (
    <Animated.View
      accessibilityRole={announced ? "progressbar" : undefined}
      accessibilityLabel={label}
      accessibilityState={{ busy: announced }}
      accessibilityElementsHidden={!announced}
      importantForAccessibility={announced ? "auto" : "no-hide-descendants"}
      style={[style, animated]}
      className={cn("rounded-2xl bg-default", className)}
    />
  );
});
