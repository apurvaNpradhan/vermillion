/**
 * Source: PanelUI (panelui-native 1.2.0), `Skeleton`. MIT licence, https://github.com/panel-ui/PanelUI.
 * Changed: `bg-default` fill, pulse on motion-slow timing (320ms each way, between 1 and 0.5
 * opacity) that holds still under Reduce Motion, and a `SkeletonList` sized to `ListRow`.
 */
import { cn } from "heroui-native";
import { memo, useEffect } from "react";
import { View, type ViewProps } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

const PULSE_MS = 320;
const PULSE_FLOOR = 0.5;
const RESTING_OPACITY = 0.75;

export type SkeletonProps = {
  className?: string;
  style?: ViewProps["style"];
  /** Name the loading region for screen readers; put it on one skeleton per region only. */
  label?: string;
};

/** A `bg-default` placeholder that pulses its opacity; still under Reduce Motion. */
export const Skeleton = memo(function Skeleton({ className, style, label }: SkeletonProps) {
  const reduced = useReducedMotion();
  const opacity = useSharedValue(reduced ? RESTING_OPACITY : 1);

  useEffect(() => {
    if (reduced) {
      opacity.value = RESTING_OPACITY;
      return undefined;
    }
    opacity.value = 1;
    opacity.value = withRepeat(
      withTiming(PULSE_FLOOR, { duration: PULSE_MS, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    return () => cancelAnimation(opacity);
  }, [opacity, reduced]);

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
      className={cn("rounded-lg bg-default", className)}
    />
  );
});

/** One list row placeholder: 48pt tall (`ListRow` min height), icon block and a title bar. */
export function SkeletonRow({ className }: { className?: string }) {
  return (
    <View className={cn("min-h-12 flex-row items-center gap-3 px-4 py-3", className)}>
      <Skeleton className="size-5 rounded-md" />
      <Skeleton className="h-4 flex-1" />
    </View>
  );
}

/**
 * `count` placeholder rows on a section card, announced once as busy. `label` is the translated
 * "Loading" text.
 */
export function SkeletonList({ count = 4, label }: { count?: number; label: string }) {
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityState={{ busy: true }}
      className="overflow-hidden rounded-2xl border border-border bg-surface"
    >
      {Array.from({ length: count }, (_, index) => (
        <SkeletonRow key={index} className={index > 0 ? "border-t border-border" : undefined} />
      ))}
    </View>
  );
}
