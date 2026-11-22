import {
  DEFAULT_THEME_ID,
  themeIds,
  variantName,
  type ThemeVariant,
} from "@workspace/ui/tokens/theme-variants";
import { z } from "zod";

// SAFETY: literal values define the appearance union used at the storage boundary.
export const APPEARANCES = ["system", "light", "dark"] as const;
export type AppearanceChoice = (typeof APPEARANCES)[number];
const appearanceSchema = z.enum(APPEARANCES);
const selectionSchema = z.object({
  /** An unknown or retired theme falls back to the default rather than failing the parse. */
  theme: z.enum(themeIds).catch(DEFAULT_THEME_ID).default(DEFAULT_THEME_ID),
  appearance: appearanceSchema,
  /** Increase contrast: stronger ink, secondary text and lines. */
  contrast: z.boolean().default(false),
});
export type ThemeChoice = z.infer<typeof selectionSchema>;
export const DEFAULT_THEME: ThemeChoice = {
  theme: DEFAULT_THEME_ID,
  appearance: "system",
  contrast: false,
};
export type SystemScheme = "light" | "dark" | null | undefined;

/**
 * Earlier formats keep their appearance and contrast. Zod strips retired fields such as the
 * palette, accent and true black, and a theme that no longer exists becomes Sigil.
 */
export function parseTheme(stored: string | null): ThemeChoice {
  if (!stored) return DEFAULT_THEME;
  const appearance = appearanceSchema.safeParse(stored);
  if (appearance.success) return { ...DEFAULT_THEME, appearance: appearance.data };
  try {
    const json: unknown = JSON.parse(stored);
    const selection = selectionSchema.safeParse(json);
    return selection.success ? selection.data : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

/** Light or dark, for native chrome. */
export function resolvedScheme(choice: ThemeChoice, systemScheme: SystemScheme): "light" | "dark" {
  return choice.appearance === "system"
    ? systemScheme === "dark"
      ? "dark"
      : "light"
    : choice.appearance;
}

/** The Uniwind theme to apply: the theme in the resolved scheme at the chosen contrast. */
export function resolvedVariant(choice: ThemeChoice, systemScheme: SystemScheme): ThemeVariant {
  const scheme = resolvedScheme(choice, systemScheme);
  return variantName(choice.theme, choice.contrast ? `${scheme}-contrast` : scheme);
}

const sameChoice = (a: ThemeChoice, b: ThemeChoice) =>
  a.theme === b.theme && a.appearance === b.appearance && a.contrast === b.contrast;

/** One device-local selection; apply, persist and notify atomically. */
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
      if (sameChoice(next, current)) return;
      current = next;
      apply(next);
      write(JSON.stringify(next));
      for (const listener of listeners) listener();
    },
  };
}
