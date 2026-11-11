/** Width of one action button revealed behind a row. */
export const SWIPE_ACTION_WIDTH = 76;
/** Seconds of a fling counted as distance already travelled when deciding to open or close. */
export const VELOCITY_LOOKAHEAD = 0.12;

/**
 * Whether a released drag should settle open. The release position is projected forward by a
 * slice of the fling velocity, so a short flick left opens the row and a flick right closes one
 * that was dragged past halfway, where a plain position check (or a one-way velocity test)
 * would not. `translation` and `velocity` are negative towards the open side.
 */
export function shouldSettleOpen(
  translation: number,
  velocity: number,
  panelWidth: number,
): boolean {
  "worklet";
  return translation + velocity * VELOCITY_LOOKAHEAD < -panelWidth / 2;
}
