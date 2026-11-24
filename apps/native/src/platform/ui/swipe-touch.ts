export type TouchPoint = { x: number; y: number };

/**
 * Whether a cancelled touch means the list started scrolling, so open rows should close.
 *
 * A row's own pan also cancels the React Native touch once it activates. That cancel must not
 * close the row: Android reports it at (0, 0), and the row may already be flagged as dragging.
 * Otherwise a mostly vertical cancel is a scroll and a horizontal one is a swipe.
 */
export function shouldCloseOnTouchCancel(
  start: TouchPoint,
  cancel: TouchPoint,
  rowDragging: boolean,
): boolean {
  if (rowDragging) return false;
  if (cancel.x === 0 && cancel.y === 0) return false;
  return Math.abs(cancel.y - start.y) >= Math.abs(cancel.x - start.x);
}

/** The open row a group should close: never the one that is being dragged right now. */
export function rowToClose<Row>(open: Row | null, dragging: Row | null): Row | null {
  return open !== null && open === dragging ? null : open;
}
