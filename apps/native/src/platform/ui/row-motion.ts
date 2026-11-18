import { FadeIn, FadeOut, LinearTransition, ReduceMotion } from "react-native-reanimated";
import { useReduceMotion } from "./use-reduce-motion";

const ENTER_MS = 200;
const EXIT_MS = 150;
/** `motion-fast`: what every row animation becomes under Reduce Motion. */
const REDUCED_MS = 120;

const entering = FadeIn.duration(ENTER_MS).reduceMotion(ReduceMotion.Never);
const exiting = FadeOut.duration(EXIT_MS).reduceMotion(ReduceMotion.Never);
const layout = LinearTransition.duration(ENTER_MS).reduceMotion(ReduceMotion.Never);
const reducedEntering = FadeIn.duration(REDUCED_MS).reduceMotion(ReduceMotion.Never);
const reducedExiting = FadeOut.duration(REDUCED_MS).reduceMotion(ReduceMotion.Never);

/**
 * Layout transitions for rows that come and go (a set added or deleted): fade in, fade out, and
 * the rows below slide to close the gap. Spread onto an `Animated.View` that is a direct child of
 * a plain `View` (not a virtualised list, whose cells recycle). Under Reduce Motion the slide is
 * dropped and the fades shorten to 120ms. Pass `exit: false` for lists keyed by position, where
 * the row that leaves is not the row that fades.
 */
export function useRowMotion({ exit = true }: { exit?: boolean } = {}) {
  const reduced = useReduceMotion();
  return {
    entering: reduced ? reducedEntering : entering,
    exiting: exit ? (reduced ? reducedExiting : exiting) : undefined,
    layout: reduced ? undefined : layout,
  };
}
