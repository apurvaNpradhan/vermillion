import { describe, expect, it } from "vitest";

import { isDark, isTheme } from "./theme";

describe("theme", () => {
  it("follows the device only for the system theme", () => {
    expect(isDark("system", true)).toBe(true);
    expect(isDark("system", false)).toBe(false);
    expect(isDark("light", true)).toBe(false);
    expect(isDark("dark", false)).toBe(true);
  });
  it("validates stored values", () => {
    expect(isTheme("dark")).toBe(true);
    expect(isTheme("sepia")).toBe(false);
    expect(isTheme(undefined)).toBe(false);
  });
});
