/** The index the dragged row would take with its centre at `fingerY` (list coordinates). */
export function targetIndex(fingerY: number, rowHeight: number, count: number): number {
  "worklet";
  const top = fingerY - rowHeight / 2;
  return Math.min(count - 1, Math.max(0, Math.round(top / rowHeight)));
}

/**
 * The slot a row that is not being dragged sits in while `from` is dragged over `to`: rows
 * between the two make room by one step.
 */
export function slotOf(index: number, from: number, to: number): number {
  "worklet";
  if (from < to && index > from && index <= to) return index - 1;
  if (from > to && index >= to && index < from) return index + 1;
  return index;
}

/** The order after moving `from` to `to`. */
export function movedOrder<T>(items: readonly T[], from: number, to: number): T[] {
  const next = [...items];
  const [moved] = next.splice(from, 1);
  if (moved !== undefined) next.splice(to, 0, moved);
  return next;
}

/** The id the moved row now sits before (`null` = last), for `moveWorkoutExercise`. */
export function beforeIdOf(ids: readonly string[], from: number, to: number): string | null {
  return movedOrder(ids, from, to)[to + 1] ?? null;
}

/** Convert viewport coordinates to a collapsed slot, including the parent's scroll offset. */
export function indexFromPosition(
  fingerY: number,
  listTop: number,
  scrollOffset: number,
  grabOffset: number,
  rowHeight: number,
  count: number,
): number {
  "worklet";
  if (count <= 0) return -1;
  return targetIndex(
    fingerY + scrollOffset - listTop - grabOffset + rowHeight / 2,
    rowHeight,
    count,
  );
}

/** Points per second, ramping quadratically through a 72pt edge band. */
export function autoScrollSpeed(fingerY: number, top: number, bottom: number): number {
  "worklet";
  const band = Math.min(72, Math.max(0, (bottom - top) / 2));
  if (band === 0) return 0;
  const up = Math.min(1, Math.max(0, (top + band - fingerY) / band));
  const down = Math.min(1, Math.max(0, (fingerY - bottom + band) / band));
  return 600 * (down * down - up * up);
}
