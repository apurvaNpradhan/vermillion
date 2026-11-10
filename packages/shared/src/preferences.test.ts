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
    const defaults = {
      bodyweightKg: null,
      keepAwake: true,
      sidebarCollapsed: false,
      dismissedHints: [],
      weightUnit: "kg",
      effortScale: "rpe",
      defaultRestSeconds: 120,
    };
    expect(uiPreferencesSchema.parse({})).toEqual(defaults);
    expect(DEFAULT_UI_PREFERENCES).toEqual(defaults);
  });
  it("keeps saved values and fills the rest", () => {
    expect(uiPreferencesSchema.parse({ sidebarCollapsed: true })).toEqual({
      ...DEFAULT_UI_PREFERENCES,
      sidebarCollapsed: true,
    });
    expect(uiPreferencesSchema.parse({ weightUnit: "lb", defaultRestSeconds: 0 })).toMatchObject({
      weightUnit: "lb",
      effortScale: "rpe",
      defaultRestSeconds: 0,
    });
  });
  it("drops unknown keys", () => {
    expect(uiPreferencesSchema.parse({ legacy: 1 })).toEqual(DEFAULT_UI_PREFERENCES);
  });
  it("rejects wrong types", () => {
    expect(uiPreferencesSchema.safeParse({ sidebarCollapsed: "yes" }).success).toBe(false);
    expect(uiPreferencesSchema.safeParse({ dismissedHints: [1] }).success).toBe(false);
    expect(uiPreferencesSchema.safeParse({ weightUnit: "stone" }).success).toBe(false);
    expect(uiPreferencesSchema.safeParse({ effortScale: "borg" }).success).toBe(false);
    expect(uiPreferencesSchema.safeParse({ defaultRestSeconds: 601 }).success).toBe(false);
    expect(uiPreferencesSchema.safeParse({ defaultRestSeconds: -1 }).success).toBe(false);
    expect(uiPreferencesSchema.safeParse({ defaultRestSeconds: 1.5 }).success).toBe(false);
  });
  it("holds a bodyweight of 20 to 400 kg or none, and keeps the screen awake by default", () => {
    expect(uiPreferencesSchema.parse({ bodyweightKg: 82.5 }).bodyweightKg).toBe(82.5);
    expect(uiPreferencesSchema.parse({ bodyweightKg: null }).bodyweightKg).toBeNull();
    expect(uiPreferencesSchema.safeParse({ bodyweightKg: 19.9 }).success).toBe(false);
    expect(uiPreferencesSchema.safeParse({ bodyweightKg: 400.1 }).success).toBe(false);
    expect(uiPreferencesPatchSchema.parse({ bodyweightKg: null })).toEqual({ bodyweightKg: null });
    expect(uiPreferencesSchema.parse({}).keepAwake).toBe(true);
    expect(uiPreferencesSchema.parse({ keepAwake: false }).keepAwake).toBe(false);
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
