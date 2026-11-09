import { DarkTheme, DefaultTheme, ThemeProvider } from "expo-router";
import { useThemeColor } from "heroui-native";
import type { ReactNode } from "react";
import { useThemeMode } from "./index";

/**
 * React Navigation's theme from the Vermillion roles, so every navigator paints `canvas` behind
 * its screens. Without it, scenes default to white and flash between tabs and pushes in dark mode.
 */
export function NavigationTheme({ children }: { children: ReactNode }) {
  const mode = useThemeMode();
  const [background, surface, foreground, border, accent] = useThemeColor([
    "background",
    "surface",
    "foreground",
    "border",
    "accent",
  ]);
  const base = mode === "dark" ? DarkTheme : DefaultTheme;
  return (
    <ThemeProvider
      value={{
        ...base,
        dark: mode === "dark",
        colors: {
          ...base.colors,
          primary: accent,
          background,
          card: surface,
          text: foreground,
          border,
          notification: accent,
        },
      }}
    >
      {children}
    </ThemeProvider>
  );
}
