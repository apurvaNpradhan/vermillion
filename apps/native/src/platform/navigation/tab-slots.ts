/**
 * Tabs that get their own button on the pill when an app does not say otherwise; the rest sit
 * behind the switcher. An app sets its own number with the tab bar's `directTabCount`.
 */
export const DEFAULT_DIRECT_TAB_COUNT = 2;
/** The pill and its menu together hold at most this many destinations. */
export const MAX_TABS = 5;

/**
 * Splits the tab routes, in declaration order, into the first `directCount` ones on the pill and
 * the rest in the menu. Routes past `MAX_TABS` are dropped: the menu is a short list, not a
 * drawer. A negative or fractional count is treated as the nearest whole number from zero up.
 */
export function tabSlots<T>(routes: readonly T[], directCount = DEFAULT_DIRECT_TAB_COUNT) {
  const kept = routes.slice(0, MAX_TABS);
  const direct = Math.max(0, Math.floor(directCount));
  return { direct: kept.slice(0, direct), overflow: kept.slice(direct) };
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
