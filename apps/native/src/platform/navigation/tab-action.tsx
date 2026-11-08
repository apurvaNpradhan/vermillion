import { useFocusEffect } from "expo-router";
import type { IconProps } from "phosphor-react-native";
import {
  createContext,
  useCallback,
  useContext,
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
};

const TabActionContext = createContext<TabActionContextValue>({
  action: null,
  setAction: () => undefined,
});

/** Holds the focused tab's action; wraps the tab navigator so its tab bar can read it. */
export function TabActionProvider({ children }: { children: ReactNode }) {
  const [action, setAction] = useState<TabAction | null>(null);
  return <TabActionContext value={{ action, setAction }}>{children}</TabActionContext>;
}

export function useCurrentTabAction() {
  return useContext(TabActionContext).action;
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
