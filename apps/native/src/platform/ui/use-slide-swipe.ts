import { useLayoutEffect } from "react";
import { usePanGesture } from "react-native-gesture-handler";
import {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";

import { useReduceMotion } from "./use-reduce-motion";

/**
 * A horizontal swipe that steps through periods, with the content sliding in the direction of
 * travel when `period` changes (a fade under Reduce Motion). With `onVertical` a long vertical
 * drag is reported too (+1 down, -1 up); without it a vertical drag is left to the scroll view.
 */
export function useSlideSwipe({
  period,
  direction,
  canPrevious,
  canNext,
  onMove,
  onVertical,
}: {
  /** Any value that changes with the period shown; a change plays the slide. */
  period: string | number;
  direction: -1 | 0 | 1;
  canPrevious: boolean;
  canNext: boolean;
  onMove: (step: -1 | 1) => void;
  onVertical?: (step: -1 | 1) => void;
}) {
  const reduced = useReduceMotion();
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
    enabled: canPrevious || canNext || onVertical !== undefined,
    activeOffsetX: [-20, 20],
    // No spread here: the worklets Babel plugin rejects SpreadElement in gesture hook configs.
    activeOffsetY: onVertical ? [-20, 20] : undefined,
    failOffsetY: onVertical ? undefined : [-12, 12],
    onDeactivate: (event) => {
      if (event.canceled) return;
      if (Math.abs(event.translationY) > Math.abs(event.translationX)) {
        if (onVertical && Math.abs(event.translationY) >= 40) {
          scheduleOnRN(onVertical, event.translationY > 0 ? 1 : -1);
        }
        return;
      }
      if (event.translationX <= -40 && canNext) scheduleOnRN(onMove, 1);
      if (event.translationX >= 40 && canPrevious) scheduleOnRN(onMove, -1);
    },
  });
  return { pan, slide };
}
