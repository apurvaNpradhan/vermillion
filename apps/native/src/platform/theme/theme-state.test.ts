import { describe, expect, it, vi } from "vitest";
import {
  APPEARANCES,
  DEFAULT_THEME,
  createThemeStore,
  parseTheme,
  resolvedScheme,
  resolvedVariant,
} from "./theme-state";

describe("device theme selection", () => {
  it("starts on Nord, following the device, at standard contrast", () => {
    expect(DEFAULT_THEME).toEqual({ theme: "nord", appearance: "system", contrast: false });
  });

  it("keeps the appearance of earlier formats", () => {
    for (const appearance of APPEARANCES) {
      expect(parseTheme(appearance)).toEqual({ ...DEFAULT_THEME, appearance });
      expect(parseTheme(JSON.stringify({ theme: "chalk", appearance }))).toEqual({
        ...DEFAULT_THEME,
        appearance,
      });
    }
  });

  it("keeps the appearance and drops true black and retired colours", () => {
    for (const stored of [
      '{"accent":"indigo","appearance":"dark","black":true}',
      '{"palette":"sage","appearance":"dark","black":true}',
      '{"appearance":"dark","black":false}',
    ]) {
      expect(parseTheme(stored)).toEqual({ ...DEFAULT_THEME, appearance: "dark" });
    }
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

  it("round-trips and resolves every appearance and contrast", () => {
    for (const appearance of APPEARANCES)
      for (const contrast of [false, true]) {
        const choice = { theme: "nord", appearance, contrast } as const;
        expect(parseTheme(JSON.stringify(choice))).toEqual(choice);
        // SAFETY: this fixed test matrix contains only supported OS schemes and the null fallback.
        for (const os of ["light", "dark", null] as const) {
          const scheme = appearance === "system" ? (os ?? "light") : appearance;
          expect(resolvedScheme(choice, os)).toBe(scheme);
          expect(resolvedVariant(choice, os)).toBe(
            contrast ? `nord-${scheme}-contrast` : `nord-${scheme}`,
          );
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
    const next = { ...DEFAULT_THEME, contrast: true };
    store.set(next);
    expect(apply).toHaveBeenLastCalledWith(next);
    expect(parseTheme(write.mock.calls[0]?.[0])).toEqual(next);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    store.set({ ...next, contrast: false });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
