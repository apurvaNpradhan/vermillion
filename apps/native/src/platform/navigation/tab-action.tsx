import { useFocusEffect } from "expo-router";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useStore } from "zustand";

import { createTabActionStore, type TabAction, type TabActionStore } from "./tab-action-store";

export type { TabAction } from "./tab-action-store";

/**
 * The store of the tab navigator that wraps the screen. Outside a provider hooks read an inert
 * store of their own, so a screen can still render alone.
 */
const TabActionContext = createContext<TabActionStore>(createTabActionStore());

/** Holds the focused tab's action; wraps the tab navigator so its tab bar can read it. */
export function TabActionProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createTabActionStore);
  return <TabActionContext value={store}>{children}</TabActionContext>;
}

/** The height pages must leave above the tab pill for what floats over it. */
export function useReservedAboveBar() {
  return useStore(useContext(TabActionContext), (state) => state.reserved);
}

/** Reserves `height` above the tab pill while mounted (0 reserves nothing). */
export function useReserveAboveBar(height: number) {
  const { setReserved } = useContext(TabActionContext).getState();
  useEffect(() => {
    setReserved(height);
    return () => setReserved(0);
  }, [height, setReserved]);
}

export function useCurrentTabAction() {
  return useStore(useContext(TabActionContext), (state) => state.action);
}

export function useTabBarHidden() {
  return useStore(useContext(TabActionContext), (state) => state.barHidden);
}

/** Hides the tab bar while `hidden` is true, for a layer that takes over the screen. */
export function useHideTabBar(hidden: boolean) {
  const { holdBarHidden } = useContext(TabActionContext).getState();
  useEffect(() => {
    if (!hidden) return;
    return holdBarHidden();
  }, [hidden, holdBarHidden]);
}

/**
 * Shows `action` beside the tab pill while the calling screen is focused. Pass a memoised
 * object: a new one each render re-registers it.
 */
export function useTabAction(action: TabAction) {
  const { setAction } = useContext(TabActionContext).getState();
  useFocusEffect(
    useCallback(() => {
      setAction(action);
      return () => setAction(null);
    }, [action, setAction]),
  );
}
