import { describe, expect, it } from "vitest";

import {
  DEFAULT_UI_PREFERENCES,
  isTimeZone,
  uiPreferencesPatchSchema,
  uiPreferencesSchema,
  updatePreferencesSchema,
} from "./preferences";

describe("ui preferences schema", () => {
  it("fills every default for an empty or missing value", () => {
    expect(uiPreferencesSchema.parse({})).toEqual({ sidebarCollapsed: false, dismissedHints: [] });
    expect(DEFAULT_UI_PREFERENCES).toEqual({ sidebarCollapsed: false, dismissedHints: [] });
  });
  it("keeps saved values and fills the rest", () => {
    expect(uiPreferencesSchema.parse({ sidebarCollapsed: true })).toEqual({
      sidebarCollapsed: true,
      dismissedHints: [],
    });
  });
  it("drops unknown keys", () => {
    expect(uiPreferencesSchema.parse({ legacy: 1 })).toEqual(DEFAULT_UI_PREFERENCES);
  });
  it("rejects wrong types", () => {
    expect(uiPreferencesSchema.safeParse({ sidebarCollapsed: "yes" }).success).toBe(false);
    expect(uiPreferencesSchema.safeParse({ dismissedHints: [1] }).success).toBe(false);
  });
  it("keeps a patch sparse, without defaults", () => {
    expect(uiPreferencesPatchSchema.parse({})).toEqual({});
    expect(uiPreferencesPatchSchema.parse({ sidebarCollapsed: true })).toEqual({
      sidebarCollapsed: true,
    });
  });
});

describe("update schema", () => {
  it("accepts any subset and null to clear", () => {
    expect(updatePreferencesSchema.parse({})).toEqual({});
    expect(updatePreferencesSchema.parse({ locale: null, timezone: "Europe/Berlin" })).toEqual({
      locale: null,
      timezone: "Europe/Berlin",
    });
  });
  it("rejects unsupported locales and bad time zones", () => {
    expect(updatePreferencesSchema.safeParse({ locale: "fr" }).success).toBe(false);
    expect(updatePreferencesSchema.safeParse({ timezone: "Mars/Olympus" }).success).toBe(false);
  });
  it("validates IANA names", () => {
    expect(isTimeZone("America/New_York")).toBe(true);
    expect(isTimeZone("Not/AZone")).toBe(false);
  });
});
