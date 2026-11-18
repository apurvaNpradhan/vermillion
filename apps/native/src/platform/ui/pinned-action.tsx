import type { ReactNode } from "react";
import { View } from "react-native";

import { useReservedAboveBar } from "@/platform/navigation/tab-action";
import { TAB_BAR_HEIGHT, useTabBarBottom } from "@/platform/navigation/tab-bar-metrics";

const SIDE = 16;
const GAP = 8;
/** Room a page leaves at the end of its content so the last row scrolls clear of the button. */
export const PINNED_ACTION_SPACE = 44 + GAP * 2 + 16;

/**
 * A primary action pinned above the floating tab bar, and above the resume bar while a Session
 * runs. Render it beside the page, not inside its scroll view, and end the scrolling content with
 * `PINNED_ACTION_SPACE` of padding.
 */
export function PinnedAction({ children }: { children: ReactNode }) {
  const bottom = useTabBarBottom();
  const reserved = useReservedAboveBar();
  return (
    <View
      pointerEvents="box-none"
      className="absolute"
      style={{ left: SIDE, right: SIDE, bottom: bottom + TAB_BAR_HEIGHT + GAP + reserved }}
    >
      {children}
    </View>
  );
}
