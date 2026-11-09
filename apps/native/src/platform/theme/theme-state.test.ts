import { describe, expect, it, vi } from "vitest";

import { createThemeStore, forcedScheme, parseTheme, resolveTheme } from "./theme-state";

describe("parseTheme", () => {
  it("reads the three current values", () => {
    expect(parseTheme("system")).toBe("system");
    expect(parseTheme("light")).toBe("light");
    expect(parseTheme("dark")).toBe("dark");
  });

  it("defaults to system when nothing or garbage is stored", () => {
    expect(parseTheme(null)).toBe("system");
    expect(parseTheme("")).toBe("system");
    expect(parseTheme("{broken")).toBe("system");
    expect(parseTheme("sepia")).toBe("system");
    expect(parseTheme(JSON.stringify({ sync: "yes" }))).toBe("system");
  });

  it("maps former theme names to light or dark", () => {
    for (const name of ["polar-light", "flexoki-light", "classic-light", "rose-pine-dawn"]) {
      expect(parseTheme(name), name).toBe("light");
    }
    for (const name of ["polar-dark", "everforest-dark", "rose-pine-moon", "catppuccin-mocha"]) {
      expect(parseTheme(name), name).toBe("dark");
    }
  });

  it("migrates the former JSON selection", () => {
    const pair = { light: "flexoki-light", dark: "kanagawa-wave" };
    expect(parseTheme(JSON.stringify({ ...pair, sync: true, single: "polar-dark" }))).toBe(
      "system",
    );
    expect(parseTheme(JSON.stringify({ ...pair, sync: false, single: "polar-dark" }))).toBe("dark");
    expect(parseTheme(JSON.stringify({ ...pair, sync: false, single: "catppuccin-latte" }))).toBe(
      "light",
    );
    expect(parseTheme(JSON.stringify({ ...pair, sync: false, single: "nonsense" }))).toBe("system");
  });
});

describe("resolveTheme and forcedScheme", () => {
  it("follows the OS only for system", () => {
    expect(resolveTheme("system", "dark")).toBe("dark");
    expect(resolveTheme("system", "light")).toBe("light");
    expect(resolveTheme("system", null)).toBe("light");
    expect(resolveTheme("dark", "light")).toBe("dark");
    expect(resolveTheme("light", "dark")).toBe("light");
  });

  it("releases the forced scheme for system", () => {
    expect(forcedScheme("system")).toBe("unspecified");
    expect(forcedScheme("light")).toBe("light");
    expect(forcedScheme("dark")).toBe("dark");
  });
});

describe("createThemeStore", () => {
  it("applies, stores and announces a change once", () => {
    const write = vi.fn();
    const apply = vi.fn();
    const listener = vi.fn();
    const store = createThemeStore({ read: () => "polar-dark", write, apply });
    expect(store.getSnapshot()).toBe("dark");
    store.subscribe(listener);
    store.set("dark");
    expect(write).not.toHaveBeenCalled();
    store.set("system");
    expect(apply).toHaveBeenCalledWith("system");
    expect(write).toHaveBeenCalledWith("system");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).toBe("system");
  });
});
