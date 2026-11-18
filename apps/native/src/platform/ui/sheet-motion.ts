import { FadeIn, FadeOut, ReduceMotion } from "react-native-reanimated";

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

/**
 * The same spring as a fade for dialogs: `Dialog.Content` takes Reanimated layout animations, not
 * bottom-sheet configs, so a dialog fades in on `motion-sheet` and out over `motion-fast`. Pass as
 * `animation={DIALOG_MOTION}`.
 */
export const DIALOG_MOTION = {
  entering: FadeIn.springify()
    .damping(SHEET_SPRING.damping)
    .stiffness(SHEET_SPRING.stiffness)
    .mass(SHEET_SPRING.mass)
    .reduceMotion(ReduceMotion.Never),
  exiting: FadeOut.duration(120).reduceMotion(ReduceMotion.Never),
};
