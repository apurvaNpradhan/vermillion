import { FadeIn, FadeOut, Keyframe, ReduceMotion, cubicBezier } from "react-native-reanimated";

/**
 * Motion of the live Session editor. Short (150-250ms) and nearly critically damped; everything
 * runs on the UI thread. Layout animations carry `ReduceMotion.System`, so they are instant when
 * the system setting is on; the CSS transitions and springs read `useReduceMotion` instead.
 */

/** A tick or an accordion chevron: ease-out with a hint of overshoot, about 180ms. */
export const TICK_MS = 180;
export const TICK_EASING = cubicBezier(0.3, 1.3, 0.5, 1);

/** The color of a cell turning from faint to full ink. */
export const INK_MS = 160;

/** The PR chip pops in: scale 0.6 to 1 with a hint of overshoot (damping ratio about 0.65). */
export const POP_SPRING = {
  damping: 18,
  stiffness: 360,
  mass: 0.65,
  reduceMotion: ReduceMotion.System,
};

/** A set that was just added: fades in and settles 8px down. */
export const SET_ENTERING = new Keyframe({
  0: { opacity: 0, transform: [{ translateY: -8 }] },
  100: { opacity: 1, transform: [{ translateY: 0 }] },
})
  .duration(200)
  .reduceMotion(ReduceMotion.System);

/** A set that was just removed. */
export const SET_EXITING = FadeOut.duration(150).reduceMotion(ReduceMotion.System);

/** An accordion body that opens: its content fades in (the height follows the list). */
export const BODY_ENTERING = FadeIn.duration(200).reduceMotion(ReduceMotion.System);

/** The Rest bar slides up from the bottom while it fades in, and back down when it ends. */
export const REST_ENTERING = new Keyframe({
  0: { opacity: 0, transform: [{ translateY: 32 }] },
  100: { opacity: 1, transform: [{ translateY: 0 }] },
})
  .duration(220)
  .reduceMotion(ReduceMotion.System);

export const REST_EXITING = new Keyframe({
  0: { opacity: 1, transform: [{ translateY: 0 }] },
  100: { opacity: 0, transform: [{ translateY: 32 }] },
})
  .duration(160)
  .reduceMotion(ReduceMotion.System);

/** The "Paused" marker. */
export const MARKER_ENTERING = FadeIn.duration(150).reduceMotion(ReduceMotion.System);
export const MARKER_EXITING = FadeOut.duration(150).reduceMotion(ReduceMotion.System);
