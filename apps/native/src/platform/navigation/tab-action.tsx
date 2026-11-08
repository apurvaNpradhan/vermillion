import { useFocusEffect } from "expo-router";
import type { IconProps } from "phosphor-react-native";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";

/** The round button beside the tab pill: the open tab's main action, such as "New note". */
export type TabAction = {
  icon: ComponentType<IconProps>;
  label: string;
  onPress: () => void;
};

type TabActionContextValue = {
  action: TabAction | null;
  setAction: (action: TabAction | null) => void;
  /** A screen covers the tab bar with its own layer (a composer). */
  barHidden: boolean;
  setBarHidden: (hidden: boolean) => void;
};

const TabActionContext = createContext<TabActionContextValue>({
  action: null,
  setAction: () => undefined,
  barHidden: false,
  setBarHidden: () => undefined,
});

/** Holds the focused tab's action; wraps the tab navigator so its tab bar can read it. */
export function TabActionProvider({ children }: { children: ReactNode }) {
  const [action, setAction] = useState<TabAction | null>(null);
  const [barHidden, setBarHidden] = useState(false);
  return (
    <TabActionContext value={{ action, setAction, barHidden, setBarHidden }}>
      {children}
    </TabActionContext>
  );
}

export function useCurrentTabAction() {
  return useContext(TabActionContext).action;
}

export function useTabBarHidden() {
  return useContext(TabActionContext).barHidden;
}

/** Hides the tab bar while `hidden` is true, for a layer that takes over the screen. */
export function useHideTabBar(hidden: boolean) {
  const { setBarHidden } = useContext(TabActionContext);
  useEffect(() => {
    setBarHidden(hidden);
    return () => setBarHidden(false);
  }, [hidden, setBarHidden]);
}

/**
 * Shows `action` beside the tab pill while the calling screen is focused. Pass a memoised
 * object: a new one each render re-registers it.
 */
export function useTabAction(action: TabAction) {
  const { setAction } = useContext(TabActionContext);
  useFocusEffect(
    useCallback(() => {
      setAction(action);
      return () => setAction(null);
    }, [action, setAction]),
  );
}
