import { useMemo } from "react";
import { FadeIn, FadeOut, ReduceMotion, SlideInDown, SlideOutDown } from "react-native-reanimated";

import { SHEET_SPRING } from "./sheet-motion";
import { useReduceMotion } from "./use-reduce-motion";

const REDUCED_MS = 120;

/**
 * Enter and exit of the docked keypad: it rises and drops on the sheet spring (`motion-sheet`),
 * and under Reduce Motion only fades for 120ms. Spread onto the keypad's `Animated.View`.
 */
export function useKeypadMotion() {
  const reduced = useReduceMotion();
  return useMemo(
    () =>
      reduced
        ? {
            entering: FadeIn.duration(REDUCED_MS).reduceMotion(ReduceMotion.Never),
            exiting: FadeOut.duration(REDUCED_MS).reduceMotion(ReduceMotion.Never),
          }
        : {
            entering: SlideInDown.springify()
              .damping(SHEET_SPRING.damping)
              .stiffness(SHEET_SPRING.stiffness)
              .mass(SHEET_SPRING.mass)
              .reduceMotion(ReduceMotion.Never),
            exiting: SlideOutDown.duration(150).reduceMotion(ReduceMotion.Never),
          },
    [reduced],
  );
}

/** The decimal separator of the device's number format ("." or ","), for the point key's face. */
export function decimalSeparator(): string {
  return (
    new Intl.NumberFormat().formatToParts(1.1).find((part) => part.type === "decimal")?.value ?? "."
  );
}
