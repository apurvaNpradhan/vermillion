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
