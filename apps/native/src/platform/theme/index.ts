import { useSyncExternalStore } from "react";
import { Appearance, type ColorValue } from "react-native";
import { Uniwind, useCSSVariable, useUniwind } from "uniwind";

import { deviceStorage } from "../storage";
import { createThemeStore, forcedScheme, resolveTheme, type ThemeChoice } from "./theme-state";

const THEME_KEY = "device.theme";
const store = createThemeStore({
  read: () => deviceStorage.get(THEME_KEY),
  write: (serialized) => deviceStorage.set(THEME_KEY, serialized),
  apply: (choice) => {
    // System releases any forced scheme so the OS keeps reporting its own appearance; Light and
    // Dark force it so native alerts, keyboards and the status bar match.
    Appearance.setColorScheme(forcedScheme(choice));
    Uniwind.setTheme(resolveTheme(choice, Appearance.getColorScheme()));
  },
});

let listening = false;

/** Apply the stored choice before the first render and follow the OS while it is "system". */
export function applyStoredTheme() {
  store.applyStored();
  if (listening) return;
  listening = true;
  Appearance.addChangeListener(({ colorScheme }) => {
    const choice = store.getSnapshot();
    if (choice === "system") Uniwind.setTheme(resolveTheme(choice, colorScheme));
  });
}

/** Device-local theme choice and its setter. Colour only; layout is shared. */
export function useThemeChoice() {
  const choice = useSyncExternalStore(store.subscribe, store.getSnapshot);
  return { choice, setChoice: (next: ThemeChoice) => store.set(next) };
}

/** Native chrome reads the mode, not the theme name. */
export function useThemeMode(): "light" | "dark" {
  const { theme } = useUniwind();
  return theme === "dark" ? "dark" : "light";
}

/** Supporting text for icons whose props require a color string. */
export function useSubtleColor(): string | undefined {
  const value = useCSSVariable("--color-subtle");
  return isColorString(value) ? value : undefined;
}

/** The selected theme's identity color, independent of its action and data roles. */
export function useIdentityColor(): string | undefined {
  const value = useCSSVariable("--color-identity");
  return isColorString(value) ? value : undefined;
}

export function isColorString(value: ColorValue | number | undefined): value is string {
  return typeof value === "string";
}
