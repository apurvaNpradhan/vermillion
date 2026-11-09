import { ReduceMotion } from "react-native-reanimated";

/**
 * `motion-sheet` from DESIGN.md for every bottom sheet and the tab pill's morph: a quick,
 * near-critically damped spring with no overshoot. With mass 0.7, stiffness 600 and damping 39
 * the damping ratio is 39 / (2 * sqrt(600 * 0.7)) = 0.95, and it settles in about 180ms. Pass as
 * `animationConfigs` to `BottomSheet.Content`.
 */
export const SHEET_SPRING = {
  damping: 39,
  stiffness: 600,
  mass: 0.7,
  overshootClamping: true,
  reduceMotion: ReduceMotion.System,
};
