import { useFocusEffect } from "expo-router";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useStore } from "zustand";

import { createTabActionStore, type TabAction, type TabActionStore } from "./tab-action-store";

export type { TabAction } from "./tab-action-store";

const TabActionContext = createContext<TabActionStore | null>(null);
// Standalone screens read idle values, and writes require a navigator store.
const idleStore = createTabActionStore();

/** Holds the focused tab's action; wraps the tab navigator so its tab bar can read it. */
export function TabActionProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createTabActionStore);
  return <TabActionContext value={store}>{children}</TabActionContext>;
}

/** The height pages must leave above the tab pill for what floats over it. */
export function useReservedAboveBar() {
  return useStore(useContext(TabActionContext) ?? idleStore, (state) => state.reserved);
}

/** Reserves `height` above the tab pill while mounted (0 reserves nothing). */
export function useReserveAboveBar(height: number) {
  const store = useContext(TabActionContext);
  useEffect(() => {
    if (!store) return;
    const { setReserved } = store.getState();
    setReserved(height);
    return () => setReserved(0);
  }, [height, store]);
}

export function useCurrentTabAction() {
  return useStore(useContext(TabActionContext) ?? idleStore, (state) => state.action);
}

export function useTabBarHidden() {
  return useStore(useContext(TabActionContext) ?? idleStore, (state) => state.barHidden);
}

/** Hides the tab bar while `hidden` is true, for a layer that takes over the screen. */
export function useHideTabBar(hidden: boolean) {
  const store = useContext(TabActionContext);
  useEffect(() => {
    if (!hidden) return;
    return store?.getState().holdBarHidden();
  }, [hidden, store]);
}

/**
 * Shows `action` beside the tab pill while the calling screen is focused. Pass a memoised
 * object: a new one each render re-registers it.
 */
export function useTabAction(action: TabAction) {
  const store = useContext(TabActionContext);
  useFocusEffect(
    useCallback(() => {
      if (!store) return;
      const { setAction } = store.getState();
      setAction(action);
      return () => setAction(null);
    }, [action, store]),
  );
}
