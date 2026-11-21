import { useEffect } from "react";
import {
  ReduceMotion,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { useReduceMotion } from "@/platform/ui/use-reduce-motion";
import { countdownBeepSecond } from "@/session/settings/sound-rules";

/** Pulse the digits once for each of the final three displayed seconds. */
export function useRestPulse(endsAt: string | null, remaining: number) {
  const opacity = useSharedValue(1);
  const reduceMotion = useReduceMotion();
  const second = countdownBeepSecond(remaining);

  useEffect(() => {
    cancelAnimation(opacity);
    opacity.set(1);
    if (endsAt === null || second === null || reduceMotion) return;
    opacity.set(
      withSequence(
        ReduceMotion.System,
        withTiming(0.72, { duration: 110 }),
        withTiming(1, { duration: 160 }),
      ),
    );
  }, [endsAt, second, reduceMotion, opacity]);

  return useAnimatedStyle(() => ({ opacity: opacity.get() }));
}
