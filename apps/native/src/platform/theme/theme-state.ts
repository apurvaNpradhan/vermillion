import { themeNames, type ThemeName } from "@workspace/ui/tokens/brand";
import { z } from "zod";

// SAFETY: literal values define the appearance union used at the storage boundary.
export const APPEARANCES = ["system", "light", "dark"] as const;
export type AppearanceChoice = (typeof APPEARANCES)[number];
const appearanceSchema = z.enum(APPEARANCES);
const selectionSchema = z.object({ theme: z.enum(themeNames), appearance: appearanceSchema });
export type ThemeChoice = z.infer<typeof selectionSchema>;
export const DEFAULT_THEME: ThemeChoice = { theme: "classic", appearance: "system" };
export type SystemScheme = "light" | "dark" | null | undefined;
export type NativeTheme = "light" | "dark" | `${Exclude<ThemeName, "classic">}-${"light" | "dark"}`;

/** Only the immediately preceding bare appearance values migrate. Invalid storage resets safely. */
export function parseTheme(stored: string | null): ThemeChoice {
  if (!stored) return DEFAULT_THEME;
  const appearance = appearanceSchema.safeParse(stored);
  if (appearance.success) return { theme: "classic", appearance: appearance.data };
  try {
    const selection = selectionSchema.safeParse(JSON.parse(stored));
    return selection.success ? selection.data : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function resolvedScheme(choice: ThemeChoice, systemScheme: SystemScheme): "light" | "dark" {
  return choice.appearance === "system"
    ? systemScheme === "dark"
      ? "dark"
      : "light"
    : choice.appearance;
}

export function resolveTheme(choice: ThemeChoice, systemScheme: SystemScheme): NativeTheme {
  const mode = resolvedScheme(choice, systemScheme);
  return choice.theme === "classic" ? mode : `${choice.theme}-${mode}`;
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
      if (next.theme === current.theme && next.appearance === current.appearance) return;
      current = next;
      apply(next);
      write(JSON.stringify(next));
      for (const listener of listeners) listener();
    },
  };
}
