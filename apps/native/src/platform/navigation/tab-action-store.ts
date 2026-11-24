import type { IconProps } from "phosphor-react-native";
import type { ComponentType } from "react";
import { createStore, type StoreApi } from "zustand/vanilla";

import { createTabBarHolds } from "./tab-bar-holds";

/** The round button beside the tab pill: the open tab's main action, such as "New exercise". */
export type TabAction = {
  icon: ComponentType<IconProps>;
  label: string;
  onPress: () => void;
};

export type TabActionState = {
  action: TabAction | null;
  /** A screen covers the tab bar with its own layer (a composer). */
  barHidden: boolean;
  /** Height of what sits above the pill (the Resume bar), so pages scroll clear of it. */
  reserved: number;
  setAction: (action: TabAction | null) => void;
  /** Hides the bar until the returned release function is called (reference-counted). */
  holdBarHidden: () => () => void;
  setReserved: (height: number) => void;
};

export type TabActionStore = StoreApi<TabActionState>;

/**
 * The tab action, bar visibility and reserved height. The setters never change, so a screen that
 * only sets (hides the bar, registers an action) reads none of the values and never re-renders
 * when they change; the tab bar selects what it draws.
 */
export function createTabActionStore(): TabActionStore {
  return createStore<TabActionState>((set) => {
    const holds = createTabBarHolds((barHidden) => set({ barHidden }));
    return {
      action: null,
      barHidden: false,
      reserved: 0,
      setAction: (action) => set({ action }),
      holdBarHidden: holds.hold,
      setReserved: (reserved) => set({ reserved }),
    };
  });
}
