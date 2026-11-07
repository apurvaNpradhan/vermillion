import { useCallback, useState } from "react";
import { Uniwind } from "uniwind";

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
