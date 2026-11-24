import {
  DEFAULT_ACCENT_ID,
  accentIds,
  variantName,
  type ThemeVariant,
} from "@workspace/ui/tokens/theme-variants";
import { z } from "zod";

// SAFETY: literal values define the appearance union used at the storage boundary.
export const APPEARANCES = ["system", "light", "dark"] as const;
export type AppearanceChoice = (typeof APPEARANCES)[number];
const appearanceSchema = z.enum(APPEARANCES);
const selectionSchema = z.object({
  appearance: appearanceSchema,
  /** An unknown or retired accent falls back to the default rather than failing the parse. */
  accent: z.enum(accentIds).catch(DEFAULT_ACCENT_ID).default(DEFAULT_ACCENT_ID),
});
export type ThemeChoice = z.infer<typeof selectionSchema>;
export const DEFAULT_THEME: ThemeChoice = { appearance: "system", accent: DEFAULT_ACCENT_ID };
export type SystemScheme = "light" | "dark" | null | undefined;

/**
 * Earlier formats keep their appearance. Zod strips retired fields (the theme id, contrast,
 * palette, true black), and a saved theme that no longer exists leaves the default accent.
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

/** The Uniwind theme to apply: the accent in the resolved scheme. */
export function resolvedVariant(choice: ThemeChoice, systemScheme: SystemScheme): ThemeVariant {
  return variantName(choice.accent, resolvedScheme(choice, systemScheme));
}

const sameChoice = (a: ThemeChoice, b: ThemeChoice) =>
  a.appearance === b.appearance && a.accent === b.accent;

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
