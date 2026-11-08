import { useCallback, useState } from "react";
import type { ColorValue } from "react-native";
import { Uniwind, useCSSVariable } from "uniwind";

import { deviceStorage } from "../storage";

export const THEMES = ["light", "dark", "system"] as const;
export type Theme = (typeof THEMES)[number];

const THEME_KEY = "device.theme";

export function isTheme(value: unknown): value is Theme {
  return THEMES.some((theme) => theme === value);
}

function readTheme(): Theme {
  const stored = deviceStorage.get(THEME_KEY);
  return isTheme(stored) ? stored : "system";
}

/** Applies the theme saved on this device. Call once before the first render. */
export function applyStoredTheme() {
  Uniwind.setTheme(readTheme());
}

/** Light, dark or system, stored on this device only (never in the database). */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(readTheme);
  const setTheme = useCallback((next: Theme) => {
    deviceStorage.set(THEME_KEY, next);
    Uniwind.setTheme(next);
    setThemeState(next);
  }, []);
  return { theme, setTheme };
}

/**
 * `text-secondary` as a color value, for icons that take a color prop (Phosphor). HeroUI's
 * `useThemeColor` only knows its own names; `subtle` is a Vermillion role.
 */
export function useSubtleColor(): string | undefined {
  const value = useCSSVariable("--color-subtle");
  return isColorString(value) ? value : undefined;
}

/** A color the app can hand to a component that takes plain strings (not a platform color). */
export function isColorString(value: ColorValue | number | undefined): value is string {
  return typeof value === "string";
}
