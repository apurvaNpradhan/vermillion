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
      sounds: true,
      soundRest: true,
      soundSets: true,
      soundMilestones: true,
      sidebarCollapsed: false,
      dismissedHints: [],
      weightIncrementKg: null,
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
  it("migrates a stored restSound:false into soundRest without breaking other values", () => {
    const migrated = uiPreferencesSchema.parse({ restSound: false, weightUnit: "lb" });
    expect(migrated).toEqual({
      ...DEFAULT_UI_PREFERENCES,
      weightUnit: "lb",
      soundRest: false,
    });
    expect("restSound" in migrated).toBe(false);
    expect(uiPreferencesSchema.parse({ restSound: true }).soundRest).toBe(true);
  });
  it("lets an explicit soundRest win over the legacy restSound", () => {
    expect(uiPreferencesSchema.parse({ restSound: false, soundRest: true }).soundRest).toBe(true);
    expect(uiPreferencesSchema.parse({ restSound: true, soundRest: false }).soundRest).toBe(false);
  });
  it("holds the sound switches independently, all on by default", () => {
    const off = uiPreferencesSchema.parse({
      sounds: false,
      soundSets: false,
      soundMilestones: false,
    });
    expect(off).toMatchObject({
      sounds: false,
      soundRest: true,
      soundSets: false,
      soundMilestones: false,
    });
    expect(uiPreferencesSchema.safeParse({ soundSets: "no" }).success).toBe(false);
    expect(uiPreferencesPatchSchema.parse({ soundRest: false, restSound: false })).toEqual({
      soundRest: false,
    });
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

it("stores a positive global kg increment or null for equipment defaults", () => {
  expect(uiPreferencesSchema.parse({}).weightIncrementKg).toBeNull();
  expect(uiPreferencesPatchSchema.parse({ weightIncrementKg: 1.25 })).toEqual({
    weightIncrementKg: 1.25,
  });
  expect(uiPreferencesPatchSchema.parse({ weightIncrementKg: null })).toEqual({
    weightIncrementKg: null,
  });
  for (const weightIncrementKg of [0, -1, 101])
    expect(uiPreferencesPatchSchema.safeParse({ weightIncrementKg }).success).toBe(false);
});
