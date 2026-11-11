/**
 * Source: PanelUI (panelui-native 1.2.0), `Skeleton`. MIT licence, https://github.com/panel-ui/PanelUI.
 * Changed: `bg-default` fill with soft corners; it stays invisible for `APPEAR_DELAY_MS` (local
 * data usually lands first, so most loads never show it), then fades in and breathes slowly
 * between two low opacities. It holds still under Reduce Motion. Plus a `SkeletonList` sized to
 * `ListRow`.
 */
import { cn } from "heroui-native";
import { memo, useEffect, type ReactNode } from "react";
import { View, type ViewProps } from "react-native";
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

/** Holds a group of placeholders (a card around them) back until the placeholders appear. */
function Appearing({ children, className }: { children: ReactNode; className?: string }) {
  const opacity = useAppearing();
  const animated = useAnimatedStyle(() => ({ opacity: opacity.value > 0 ? 1 : 0 }));
  return (
    <Animated.View style={animated} className={className}>
      {children}
    </Animated.View>
  );
}

/** One list row placeholder: 48pt tall (`ListRow` min height), icon block and a title bar. */
export function SkeletonRow({ className }: { className?: string }) {
  return (
    <View className={cn("min-h-12 flex-row items-center gap-3 px-4 py-3", className)}>
      <Skeleton className="size-5 rounded-full" />
      <Skeleton className="h-3 w-1/2 rounded-full" />
    </View>
  );
}

/**
 * `count` placeholder rows on a section card, announced once as busy. `label` is the translated
 * "Loading" text.
 */
export function SkeletonList({ count = 4, label }: { count?: number; label: string }) {
  return (
    <Appearing>
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
    </Appearing>
  );
}
