import { FadeIn, FadeOut, Keyframe, ReduceMotion, cubicBezier } from "react-native-reanimated";

/**
 * The live editor gates these animations on the current OS setting before attaching them.
 * Reanimated’s own system policy uses the setting captured at startup.
 */

/** A tick or an accordion chevron: ease-out with a hint of overshoot, about 180ms. */
export const TICK_MS = 180;
export const TICK_EASING = cubicBezier(0.3, 1.3, 0.5, 1);

/** The color of a cell turning from faint to full ink. */
export const INK_MS = 160;

/** The PR chip scales and fades in with a small overshoot. */
export const RECORD_ENTERING = new Keyframe({
  0: { opacity: 0, transform: [{ scale: 0.6 }] },
  70: { opacity: 1, transform: [{ scale: 1.08 }] },
  100: { opacity: 1, transform: [{ scale: 1 }] },
})
  .duration(220)
  .reduceMotion(ReduceMotion.Never);

/** An accordion body that opens: its content fades in (the height follows the list). */
export const BODY_ENTERING = FadeIn.duration(200).reduceMotion(ReduceMotion.Never);

/** The Rest bar slides up from the bottom while it fades in, and back down when it ends. */
export const REST_ENTERING = new Keyframe({
  0: { opacity: 0, transform: [{ translateY: 32 }] },
  100: { opacity: 1, transform: [{ translateY: 0 }] },
})
  .duration(220)
  .reduceMotion(ReduceMotion.Never);

export const REST_EXITING = new Keyframe({
  0: { opacity: 1, transform: [{ translateY: 0 }] },
  100: { opacity: 0, transform: [{ translateY: 32 }] },
})
  .duration(160)
  .reduceMotion(ReduceMotion.Never);

/** The "Paused" marker. */
export const MARKER_ENTERING = FadeIn.duration(150).reduceMotion(ReduceMotion.Never);
export const MARKER_EXITING = FadeOut.duration(150).reduceMotion(ReduceMotion.Never);
