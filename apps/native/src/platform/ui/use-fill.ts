import { useEffect } from "react";
import {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

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
  const reduced = useReducedMotion();
  const width = useSharedValue(clamped);
  useEffect(() => {
    width.value = withTiming(clamped, {
      duration: reduced ? REDUCED_MS : FILL_MS,
      easing: Easing.inOut(Easing.ease),
      reduceMotion: ReduceMotion.Never,
    });
  }, [clamped, reduced, width]);
  return useAnimatedStyle(() => ({ width: `${width.value * 100}%` }));
}
