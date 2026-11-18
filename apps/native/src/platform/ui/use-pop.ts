import { useEffect, useRef } from "react";
import {
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import { POP_REDUCED_MS, POP_SCALE, POP_UP_MS, shouldPop } from "./pop-math";

const SETTLE = { damping: 20, stiffness: 400, mass: 0.6, reduceMotion: ReduceMotion.Never };

/**
 * A one-off scale pop (1, then 1.15, then back) for a check that turns on: the set-complete tick.
 * Apply the returned style to an `Animated.View`. It plays when `on` goes from false to true,
 * not on mount and not when it turns off, and never loops. Under Reduce Motion the pop becomes a
 * 120ms fade-in instead of a scale.
 */
export function usePop(on: boolean) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);
  const reduced = useReducedMotion();
  const previous = useRef<boolean | null>(null);
  useEffect(() => {
    if (shouldPop(previous.current, on)) {
      if (reduced) {
        opacity.value = 0;
        opacity.value = withTiming(1, { duration: POP_REDUCED_MS });
      } else {
        scale.value = withSequence(
          withTiming(POP_SCALE, { duration: POP_UP_MS }),
          withSpring(1, SETTLE),
        );
      }
    }
    previous.current = on;
  }, [on, reduced, scale, opacity]);
  return useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ scale: scale.value }] }));
}
