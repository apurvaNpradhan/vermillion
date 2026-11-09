import { z } from "zod";

/** The device's theme choice: follow the OS, or force Light or Dark. */
export const THEME_CHOICES = ["system", "light", "dark"] as const;
export type ThemeChoice = (typeof THEME_CHOICES)[number];

export const DEFAULT_THEME: ThemeChoice = "system";

export type SystemScheme = "light" | "dark" | null | undefined;

const themeChoiceSchema = z.enum(THEME_CHOICES);

/** Older builds stored a named theme; map it to the nearest of the three. */
function fromName(name: string): ThemeChoice | null {
  if (
    name.endsWith("-light") ||
    ["rose-pine-dawn", "catppuccin-latte", "kanagawa-lotus"].includes(name)
  ) {
    return "light";
  }
  if (
    name.endsWith("-dark") ||
    ["rose-pine-moon", "catppuccin-mocha", "kanagawa-wave"].includes(name)
  ) {
    return "dark";
  }
  return null;
}

const legacySchema = z.object({
  sync: z.boolean(),
  light: z.string(),
  dark: z.string(),
  single: z.string(),
});

/**
 * Read the stored value: the current string, a former bare theme name, or the former JSON
 * `{sync, light, dark, single}`. Anything else is "system".
 */
export function parseTheme(stored: string | null): ThemeChoice {
  if (!stored) return DEFAULT_THEME;
  const direct = themeChoiceSchema.safeParse(stored);
  if (direct.success) return direct.data;
  const named = fromName(stored);
  if (named) return named;
  try {
    const legacy = legacySchema.safeParse(JSON.parse(stored));
    if (!legacy.success) return DEFAULT_THEME;
    if (legacy.data.sync) return "system";
    return fromName(legacy.data.single) ?? DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

/** The Uniwind theme in effect. Without a known OS scheme, System falls back to light. */
export function resolveTheme(choice: ThemeChoice, systemScheme: SystemScheme): "light" | "dark" {
  if (choice === "system") return systemScheme === "dark" ? "dark" : "light";
  return choice;
}

/** What `Appearance.setColorScheme` gets: System releases any forced scheme. */
export function forcedScheme(choice: ThemeChoice): "light" | "dark" | "unspecified" {
  return choice === "system" ? "unspecified" : choice;
}

/** One persisted choice; every change is applied, stored and announced together. */
export function createThemeStore({
  read,
  write,
  apply,
}: {
  read: () => string | null;
  write: (serialized: string) => void;
  apply: (choice: ThemeChoice) => void;
}) {
  let current = parseTheme(read());
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => current,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    applyStored() {
      apply(current);
    },
    set(next: ThemeChoice) {
      if (next === current) return;
      apply(next);
      current = next;
      write(next);
      for (const listener of listeners) listener();
    },
  };
}
