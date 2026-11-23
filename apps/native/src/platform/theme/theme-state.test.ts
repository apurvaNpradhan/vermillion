import { accentIds } from "@workspace/ui/tokens/theme-variants";
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
  it("starts on Acid, following the device", () => {
    expect(DEFAULT_THEME).toEqual({ appearance: "system", accent: "acid" });
  });

  it("keeps the appearance of earlier formats", () => {
    for (const appearance of APPEARANCES) {
      expect(parseTheme(appearance)).toEqual({ ...DEFAULT_THEME, appearance });
      expect(parseTheme(JSON.stringify({ theme: "chalk", appearance }))).toEqual({
        ...DEFAULT_THEME,
        appearance,
      });
      expect(parseTheme(JSON.stringify({ theme: "classic", appearance }))).toEqual({
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

  it("round-trips and resolves every appearance and accent", () => {
    for (const appearance of APPEARANCES)
      for (const accent of accentIds) {
        const choice = { appearance, accent };
        expect(parseTheme(JSON.stringify(choice))).toEqual(choice);
        // SAFETY: this fixed test matrix contains only supported OS schemes and the null fallback.
        for (const os of ["light", "dark", null] as const) {
          const scheme = appearance === "system" ? (os ?? "light") : appearance;
          expect(resolvedScheme(choice, os)).toBe(scheme);
          expect(resolvedVariant(choice, os)).toBe(`${accent}-${scheme}`);
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
    const next = { appearance: "dark" as const, accent: "ember" as const };
    store.set(next);
    expect(apply).toHaveBeenLastCalledWith(next);
    expect(parseTheme(write.mock.calls[0]?.[0])).toEqual(next);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    store.set({ ...next, accent: "mono" });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("retired themes", () => {
  it.each(["sigil", "classic", "patina", "graphite", "oxide", "slate", "mulberry", "nord"])(
    "migrates the saved theme %s to the default accent and keeps the appearance",
    (theme) => {
      const stored = JSON.stringify({ theme, appearance: "dark", contrast: true });
      expect(parseTheme(stored)).toEqual({ appearance: "dark", accent: "acid" });
    },
  );

  it.each(["lime", "teal", "blueberry", "lavender", "tangerine"])(
    "migrates the retired or unknown accent %s to Acid",
    (accent) => {
      const stored = JSON.stringify({ appearance: "light", accent });
      expect(parseTheme(stored)).toEqual({ appearance: "light", accent: "acid" });
    },
  );

  it("keeps every current accent", () => {
    for (const accent of ["acid", "gold", "ember", "rose", "ice", "mono"]) {
      expect(parseTheme(JSON.stringify({ appearance: "dark", accent }))).toEqual({
        appearance: "dark",
        accent,
      });
    }
  });
});
