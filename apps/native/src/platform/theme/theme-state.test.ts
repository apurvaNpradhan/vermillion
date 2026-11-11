import { themeNames } from "@workspace/ui/tokens/brand";
import { describe, expect, it, vi } from "vitest";
import {
  APPEARANCES,
  createThemeStore,
  parseTheme,
  resolvedScheme,
  resolveTheme,
} from "./theme-state";

describe("device theme selection", () => {
  it("migrates only the previous bare appearance values", () => {
    for (const appearance of APPEARANCES) {
      expect(parseTheme(appearance)).toEqual({ theme: "classic", appearance });
    }
  });
  it("falls back safely on invalid and retired storage formats", () => {
    for (const stored of [
      null,
      "",
      "{broken",
      "sepia",
      "polar-dark",
      '{"sync":true,"light":"classic-light","dark":"classic-dark","single":"polar-dark"}',
      '{"theme":"chalk","appearance":"sepia"}',
    ]) {
      expect(parseTheme(stored)).toEqual({ theme: "classic", appearance: "system" });
    }
  });
  it("round-trips and resolves every theme and appearance", () => {
    for (const theme of themeNames)
      for (const appearance of APPEARANCES) {
        const choice = { theme, appearance };
        expect(parseTheme(JSON.stringify(choice))).toEqual(choice);
        // SAFETY: this fixed test matrix contains only supported OS schemes and the null fallback.
        for (const os of ["light", "dark", null] as const) {
          const mode = appearance === "system" ? (os ?? "light") : appearance;
          expect(resolvedScheme(choice, os)).toBe(mode);
          expect(resolveTheme(choice, os)).toBe(theme === "classic" ? mode : `${theme}-${mode}`);
        }
      }
  });
  it("applies, persists and announces each actual change once", () => {
    const write = vi.fn();
    const apply = vi.fn();
    const listener = vi.fn();
    const store = createThemeStore({ read: () => "dark", write, apply });
    const unsubscribe = store.subscribe(listener);
    store.applyStored();
    expect(apply).toHaveBeenCalledWith({ theme: "classic", appearance: "dark" });
    store.set({ theme: "classic", appearance: "dark" });
    expect(write).not.toHaveBeenCalled();
    // SAFETY: keep the supported selection literals for the store contract.
    const next = { theme: "chalk", appearance: "system" } as const;
    store.set(next);
    expect(apply).toHaveBeenLastCalledWith(next);
    expect(parseTheme(write.mock.calls[0]?.[0])).toEqual(next);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    store.set({ theme: "iron", appearance: "light" });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
