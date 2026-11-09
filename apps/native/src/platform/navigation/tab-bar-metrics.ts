import { useSafeAreaInsets } from "react-native-safe-area-context";

/** Height of the pill and diameter of the action button beside it. */
export const TAB_BAR_HEIGHT = 56;
/** Space between the pill and the bottom safe-area edge. */
export const TAB_BAR_GAP = 8;
/** Inset between the pill's edge and the active capsule. */
export const TAB_BAR_PADDING = 4;
/** Width of one slot on the pill; with the pill's inner height of 48 it makes a stadium. */
export const TAB_ITEM_WIDTH = 64;
/** Narrowest the morphed panel gets, so its rows fit when the pill is narrower. */
export const PANEL_MIN_WIDTH = 260;
/** Height of one row in the panel, which the scrub gesture relies on. */
export const MENU_ROW_HEIGHT = 48;

/** Distance from the bottom of the window to the bottom of the pill. */
export function useTabBarBottom(): number {
  return useSafeAreaInsets().bottom + TAB_BAR_GAP;
}

/** Bottom padding a tab screen needs so its last row scrolls clear of the floating pill. */
export function useTabBarClearance(): number {
  return useTabBarBottom() + TAB_BAR_HEIGHT + 16;
}
