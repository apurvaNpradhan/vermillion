import { accentNames, variantName } from "@workspace/ui/tokens/brand";
import { describe, expect, it, vi } from "vitest";
import {
  APPEARANCES,
  DEFAULT_THEME,
  createThemeStore,
  modeOfVariant,
  parseTheme,
  resolvedMode,
  resolvedScheme,
  resolveTheme,
} from "./theme-state";

describe("device theme selection", () => {
  it("keeps the appearance of earlier formats and starts them on the default accent", () => {
    for (const appearance of APPEARANCES) {
      expect(parseTheme(appearance)).toEqual({ ...DEFAULT_THEME, appearance });
      expect(parseTheme(JSON.stringify({ theme: "chalk", appearance }))).toEqual({
        ...DEFAULT_THEME,
        appearance,
      });
    }
  });
  it("keeps the appearance when only the accent is unknown", () => {
    expect(parseTheme('{"accent":"lime","appearance":"dark","black":true}')).toEqual({
      ...DEFAULT_THEME,
      appearance: "dark",
    });
  });
  it("falls back safely on invalid storage", () => {
    for (const stored of [
      null,
      "",
      "{broken",
      "sepia",
      "polar-dark",
      '{"sync":true,"light":"classic-light","dark":"classic-dark","single":"polar-dark"}',
      '{"theme":"chalk","appearance":"sepia"}',
    ]) {
      expect(parseTheme(stored)).toEqual(DEFAULT_THEME);
    }
  });
  it("round-trips and resolves every accent, appearance and black setting", () => {
    for (const accent of accentNames)
      for (const appearance of APPEARANCES)
        for (const black of [false, true]) {
          const choice = { accent, appearance, black };
          expect(parseTheme(JSON.stringify(choice))).toEqual(choice);
          // SAFETY: this fixed test matrix contains only supported OS schemes and the null fallback.
          for (const os of ["light", "dark", null] as const) {
            const scheme = appearance === "system" ? (os ?? "light") : appearance;
            const mode = scheme === "dark" && black ? "black" : scheme;
            expect(resolvedScheme(choice, os)).toBe(scheme);
            expect(resolvedMode(choice, os)).toBe(mode);
            expect(resolveTheme(choice, os)).toBe(variantName(accent, mode));
            expect(modeOfVariant(resolveTheme(choice, os))).toBe(mode);
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
    expect(apply).toHaveBeenCalledWith({ ...DEFAULT_THEME, appearance: "dark" });
    store.set({ ...DEFAULT_THEME, appearance: "dark" });
    expect(write).not.toHaveBeenCalled();
    // SAFETY: keep the supported selection literals for the store contract.
    const next = { accent: "cobalt", appearance: "system", black: true } as const;
    store.set(next);
    expect(apply).toHaveBeenLastCalledWith(next);
    expect(parseTheme(write.mock.calls[0]?.[0])).toEqual(next);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    store.set({ ...next, black: false });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
