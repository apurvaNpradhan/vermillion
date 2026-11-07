export const THEMES = ["light", "dark", "system"] as const;
export type Theme = (typeof THEMES)[number];
export const THEME_COOKIE = "theme";

export function isTheme(value: unknown): value is Theme {
  return THEMES.some((theme) => theme === value);
}

/** Whether a theme shows dark colors, given the device's color scheme. */
export function isDark(theme: Theme, systemPrefersDark: boolean): boolean {
  return theme === "dark" || (theme === "system" && systemPrefersDark);
}

/**
 * Runs in the document head before first paint so a "system" theme never
 * flashes. An explicit theme is also rendered by the server; this covers the rest.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var m=document.cookie.match(/(?:^|; )${THEME_COOKIE}=([^;]+)/);var t=m?m[1]:"system";var d=t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);}catch(e){}})();`;
