/** Tabs that get their own button on the pill; the rest sit behind the switcher. */
export const DIRECT_TAB_COUNT = 2;
/** The pill and its menu together hold at most this many destinations. */
export const MAX_TABS = 5;

/**
 * Splits the tab routes, in declaration order, into the ones on the pill and the ones in the
 * menu. Routes past `MAX_TABS` are dropped: the menu is a short list, not a drawer.
 */
export function tabSlots<T>(routes: readonly T[], directCount = DIRECT_TAB_COUNT) {
  const kept = routes.slice(0, MAX_TABS);
  return { direct: kept.slice(0, directCount), overflow: kept.slice(directCount) };
}

/**
 * The menu row under a finger at `y` (window coordinates) during a scrub, or `null` above or
 * below the rows. Rows are `rowHeight` tall and start at `rowsTop`.
 */
export function scrubIndex(
  y: number,
  rows: { top: number; rowHeight: number; count: number },
): number | null {
  const offset = y - rows.top;
  if (offset < 0 || rows.rowHeight <= 0) return null;
  const index = Math.floor(offset / rows.rowHeight);
  return index < rows.count ? index : null;
}
