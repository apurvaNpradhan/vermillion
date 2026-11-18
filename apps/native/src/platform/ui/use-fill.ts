import { useEffect, useRef } from "react";
import {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useReduceMotion } from "./use-reduce-motion";

/** `motion-slow` for a bar filling; `motion-fast` under Reduce Motion. */
const FILL_MS = 320;
const REDUCED_MS = 120;

/**
 * An animated width for a bar that fills (0 to 1) when its value changes: `motion-slow`, and
 * 120ms under Reduce Motion. It starts at the first value, so a bar that mounts full does not
 * animate in. Apply to an `Animated.View` inside a track.
 */
export function useFillStyle(fraction: number) {
  const clamped = Math.min(1, Math.max(0, fraction));
  const reduced = useReduceMotion();
  const width = useSharedValue(clamped);
  const opacity = useSharedValue(1);
  const first = useRef(true);
  useEffect(() => {
    if (reduced) {
      // No sliding width: the final width at once, with a short fade to mark the change.
      width.value = clamped;
      if (!first.current) {
        opacity.value = 0;
        opacity.value = withTiming(1, { duration: REDUCED_MS, reduceMotion: ReduceMotion.Never });
      }
    } else {
      opacity.value = 1;
      width.value = withTiming(clamped, {
        duration: FILL_MS,
        easing: Easing.inOut(Easing.ease),
        reduceMotion: ReduceMotion.Never,
      });
    }
    first.current = false;
  }, [clamped, reduced, width, opacity]);
  return useAnimatedStyle(() => ({ width: `${width.value * 100}%`, opacity: opacity.value }));
}
