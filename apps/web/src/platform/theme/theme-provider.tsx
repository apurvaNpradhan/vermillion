import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { isDark, THEME_COOKIE, type Theme } from "./theme";

const ONE_YEAR = 60 * 60 * 24 * 365;

type ThemeContext = { theme: Theme; setTheme: (theme: Theme) => void };

const Context = createContext<ThemeContext | null>(null);

function applyTheme(theme: Theme) {
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.classList.toggle("dark", isDark(theme, systemDark));
}

/**
 * Theme is per device: a cookie, never the database. The server reads it to
 * render the right class on first paint; the head script covers "system".
 */
export function ThemeProvider({
  initialTheme,
  children,
}: {
  initialTheme: Theme;
  children: ReactNode;
}) {
  const [theme, setThemeState] = useState<Theme>(initialTheme);

  const setTheme = useCallback((next: Theme) => {
    document.cookie = `${THEME_COOKIE}=${next}; Path=/; Max-Age=${ONE_YEAR}; SameSite=Lax`;
    setThemeState(next);
    applyTheme(next);
  }, []);

  useEffect(() => {
    if (theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [theme]);

  const value = useMemo(() => ({ theme, setTheme }), [theme, setTheme]);
  return <Context value={value}>{children}</Context>;
}

export function useTheme(): ThemeContext {
  const value = use(Context);
  if (!value) throw new Error("useTheme must be used inside ThemeProvider");
  return value;
}
