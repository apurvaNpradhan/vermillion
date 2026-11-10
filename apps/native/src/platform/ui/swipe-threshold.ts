/** Width of one action button revealed behind a row. */
export const SWIPE_ACTION_WIDTH = 76;
/** Share of the row's width a drag must pass for a full swipe. */
export const FULL_SWIPE_RATIO = 0.55;

/**
 * Whether a drag has gone far enough to fire the outermost action on release (a full swipe).
 * `translation` is negative for a drag to the left. It must pass both a share of the row and
 * the revealed buttons plus one more, so a narrow row never fires from merely opening.
 */
export function isFullSwipe(translation: number, rowWidth: number, actionCount: number): boolean {
  "worklet";
  const distance = Math.abs(translation);
  const threshold = Math.max(rowWidth * FULL_SWIPE_RATIO, (actionCount + 1) * SWIPE_ACTION_WIDTH);
  return rowWidth > 0 && distance >= threshold;
}

/** Share of the row's width a drag must pass to fire a direct swipe. */
export const DIRECT_SWIPE_RATIO = 0.4;

/** Whether a drag has gone far enough to fire a direct (no buttons) swipe on release. */
export function isDirectSwipe(translation: number, rowWidth: number): boolean {
  "worklet";
  return (
    rowWidth > 0 &&
    Math.abs(translation) >= Math.max(rowWidth * DIRECT_SWIPE_RATIO, SWIPE_ACTION_WIDTH)
  );
}

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
