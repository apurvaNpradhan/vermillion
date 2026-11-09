/**
 * `motion-page` for every stack: the new page slides in from the right and pop reverses it,
 * 180ms, with a swipe-back from anywhere on iOS. Reduce Motion is honoured by the OS.
 */
export const STACK_OPTIONS = {
  headerShown: false,
  animation: "slide_from_right",
  animationDuration: 180,
  fullScreenGestureEnabled: true,
} as const;
