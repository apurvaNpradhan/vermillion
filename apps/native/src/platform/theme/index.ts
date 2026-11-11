import { brandThemes } from "@workspace/ui/tokens/brand";
import * as SystemUI from "expo-system-ui";
import { useSyncExternalStore } from "react";
import { AppState, Appearance, type ColorValue } from "react-native";
import { Uniwind, useCSSVariable, useUniwind } from "uniwind";

import { deviceStorage } from "../storage";
import { createThemeStore, resolvedScheme, resolveTheme, type ThemeChoice } from "./theme-state";

let systemScheme = Appearance.getColorScheme();
let applying = false;
let lastAppearance: ThemeChoice["appearance"] | undefined;
let refreshFrame: number | undefined;

function refreshSystemScheme() {
  if (refreshFrame !== undefined) cancelAnimationFrame(refreshFrame);
  applying = true;
  // Release a previous forced mode before reading the OS again, including after backgrounding.
  Appearance.setColorScheme("auto");
  refreshFrame = requestAnimationFrame(() => {
    refreshFrame = requestAnimationFrame(() => {
      refreshFrame = undefined;
      systemScheme = Appearance.getColorScheme();
      applying = false;
      applyTheme(store.getSnapshot());
    });
  });
}

function applyTheme(choice: ThemeChoice) {
  const returningToSystem =
    choice.appearance === "system" && lastAppearance !== undefined && lastAppearance !== "system";
  lastAppearance = choice.appearance;
  if (returningToSystem) {
    refreshSystemScheme();
    return;
  }
  if (refreshFrame !== undefined) {
    cancelAnimationFrame(refreshFrame);
    refreshFrame = undefined;
  }
  const scheme = resolvedScheme(choice, systemScheme);
  applying = true;
  Uniwind.setTheme(resolveTheme(choice, systemScheme));
  // Custom Uniwind themes reset Appearance; force native chrome AFTER setting the theme.
  Appearance.setColorScheme(scheme);
  applying = false;
  void SystemUI.setBackgroundColorAsync(brandThemes[choice.theme][scheme].canvas);
}

const THEME_KEY = "device.theme";
const store = createThemeStore({
  read: () => deviceStorage.get(THEME_KEY),
  write: (serialized) => deviceStorage.set(THEME_KEY, serialized),
  apply: applyTheme,
});

let listening = false;

/** Apply the stored choice before the first render and follow the OS while it is "system". */
export function applyStoredTheme() {
  store.applyStored();
  if (listening) return;
  listening = true;
  AppState.addEventListener("change", (state) => {
    if (state === "active" && store.getSnapshot().appearance === "system") refreshSystemScheme();
  });
  Appearance.addChangeListener(({ colorScheme }) => {
    const choice = store.getSnapshot();
    if (applying || choice.appearance !== "system") return;
    if (systemScheme === colorScheme) return;
    systemScheme = colorScheme;
    applyTheme(choice);
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
  return theme === "dark" || theme.endsWith("-dark") ? "dark" : "light";
}

/** Supporting text for icons whose props require a color string. */
export function useSubtleColor(): string | undefined {
  const value = useCSSVariable("--color-subtle");
  return isColorString(value) ? value : undefined;
}

/** The check on a completed set's tick. */
export function useOnSetDoneColor(): string | undefined {
  const value = useCSSVariable("--color-on-set-done");
  return isColorString(value) ? value : undefined;
}

/** The selected theme's identity color, independent of its action and data roles. */
export function useIdentityColor(): string | undefined {
  const value = useCSSVariable("--color-identity");
  return isColorString(value) ? value : undefined;
}

/** The icon and text colour on an `identity` fill. */
export function useOnIdentityColor(): string | undefined {
  const value = useCSSVariable("--color-on-identity");
  return isColorString(value) ? value : undefined;
}

export function isColorString(value: ColorValue | number | undefined): value is string {
  return typeof value === "string";
}

/** Chart marks have their own palette role, independent of selection. */
export function useChartColor() {
  const value = useCSSVariable("--color-chart");
  return isColorString(value) ? value : undefined;
}
