import { createContext, useContext } from "react";
import { FadeIn, FadeOut, ReduceMotion } from "react-native-reanimated";

import { useReduceMotion } from "./use-reduce-motion";

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

const REDUCED_DIALOG = {
  entering: FadeIn.duration(120).reduceMotion(ReduceMotion.Never),
  exiting: FadeOut.duration(120).reduceMotion(ReduceMotion.Never),
};

const DIALOG_MOTION = {
  entering: FadeIn.springify()
    .damping(SHEET_SPRING.damping)
    .stiffness(SHEET_SPRING.stiffness)
    .mass(SHEET_SPRING.mass)
    .reduceMotion(ReduceMotion.Never),
  exiting: FadeOut.duration(120).reduceMotion(ReduceMotion.Never),
};

/**
 * The same spring as a fade for dialogs: `Dialog.Content` takes Reanimated layout animations, not
 * bottom-sheet configs, so a dialog fades in on `motion-sheet` and out over `motion-fast`. Under
 * Reduce Motion both are a 120ms fade. Pass the result as `animation`.
 */
export function useDialogMotion() {
  return useReduceMotion() ? REDUCED_DIALOG : DIALOG_MOTION;
}

/** A screen can opt its sheets out of motion without changing shared callers. */
export const InstantSheets = createContext(false);

export function useSheetAnimation(): "disable-all" | undefined {
  return useContext(InstantSheets) ? "disable-all" : undefined;
}
