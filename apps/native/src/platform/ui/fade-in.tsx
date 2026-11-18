import type { ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import Animated, { FadeIn as ReanimatedFadeIn, ReduceMotion } from "react-native-reanimated";

/** How long local content takes to appear; short enough to feel like the screen was just there. */
export const FADE_IN_MS = 150;

const ENTERING = ReanimatedFadeIn.duration(FADE_IN_MS).reduceMotion(ReduceMotion.System);

/**
 * Fades its content in once, when it mounts. Data that lives on the device (the local database,
 * saved preferences) answers in milliseconds, so screens render nothing while it loads and then
 * show their content through this, instead of drawing a skeleton that would flash. Under Reduce
 * Motion the content appears at once. `Skeleton` is only for waits on the network.
 */
export function FadeIn({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Animated.View entering={ENTERING} className={className} style={style}>
      {children}
    </Animated.View>
  );
}
