import {
  accentNames,
  variantName,
  type ThemeMode,
  type ThemeVariant,
} from "@workspace/ui/tokens/brand";
import { z } from "zod";

// SAFETY: literal values define the appearance union used at the storage boundary.
export const APPEARANCES = ["system", "light", "dark"] as const;
export type AppearanceChoice = (typeof APPEARANCES)[number];
const appearanceSchema = z.enum(APPEARANCES);
const selectionSchema = z.object({
  accent: z.enum(accentNames),
  appearance: appearanceSchema,
  /** Dark uses a pure black canvas. Light is unaffected. */
  black: z.boolean(),
});
/** The retired `{ theme, appearance }` shape: only its appearance carries over. */
const retiredSchema = z.object({ appearance: appearanceSchema });
export type ThemeChoice = z.infer<typeof selectionSchema>;
export const DEFAULT_THEME: ThemeChoice = { accent: "mono", appearance: "system", black: false };
export type SystemScheme = "light" | "dark" | null | undefined;

/** Earlier formats keep their appearance and start on the default accent. Invalid storage resets. */
export function parseTheme(stored: string | null): ThemeChoice {
  if (!stored) return DEFAULT_THEME;
  const appearance = appearanceSchema.safeParse(stored);
  if (appearance.success) return { ...DEFAULT_THEME, appearance: appearance.data };
  try {
    const json: unknown = JSON.parse(stored);
    const selection = selectionSchema.safeParse(json);
    if (selection.success) return selection.data;
    const retired = retiredSchema.safeParse(json);
    return retired.success
      ? { ...DEFAULT_THEME, appearance: retired.data.appearance }
      : DEFAULT_THEME;
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

/** The palette mode: the scheme, with true black replacing dark when chosen. */
export function resolvedMode(choice: ThemeChoice, systemScheme: SystemScheme): ThemeMode {
  const scheme = resolvedScheme(choice, systemScheme);
  return scheme === "dark" && choice.black ? "black" : scheme;
}

export function resolveTheme(choice: ThemeChoice, systemScheme: SystemScheme): ThemeVariant {
  return variantName(choice.accent, resolvedMode(choice, systemScheme));
}

/** The palette mode of an applied variant name. */
export function modeOfVariant(variant: string): ThemeMode {
  if (variant === "black" || variant.endsWith("-black")) return "black";
  return variant === "dark" || variant.endsWith("-dark") ? "dark" : "light";
}

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
      if (
        next.accent === current.accent &&
        next.appearance === current.appearance &&
        next.black === current.black
      )
        return;
      current = next;
      apply(next);
      write(JSON.stringify(next));
      for (const listener of listeners) listener();
    },
  };
}
