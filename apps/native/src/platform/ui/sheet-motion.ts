import { ReduceMotion } from "react-native-reanimated";

/**
 * `motion-sheet` from DESIGN.md for every bottom sheet: a stiff, critically damped spring that
 * settles in about 200ms with no overshoot. Pass as `animationConfigs` to `BottomSheet.Content`.
 */
export const SHEET_SPRING = {
  damping: 34,
  stiffness: 420,
  mass: 0.8,
  overshootClamping: true,
  reduceMotion: ReduceMotion.System,
};
