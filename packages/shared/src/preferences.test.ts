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
      weighInReminder: { enabled: false, time: "08:00" },
      checkInReminder: { enabled: false, weekday: 1, time: "09:00" },
      trainingReminder: { enabled: false, weekdays: null, time: "18:00" },
      reportReminder: { enabled: false },
      restVibration: true,
      cueVolume: 100,
      avatarMediaId: null,
      lengthUnit: "cm",
      heightCm: null,
      trackedMetrics: ["waist", "chest", "left_bicep", "right_bicep", "left_thigh", "right_thigh"],
      weightGoalKg: null,
      bodyweightKg: null,
      hidePhotos: true,
      keepAwake: true,
      sounds: true,
      soundRest: true,
      soundSets: true,
      soundMilestones: true,
      systemKeyboard: false,
      inlineTimer: true,
      supersetScroll: true,
      recordAlerts: true,
      sidebarCollapsed: false,
      dismissedHints: [],
      weightIncrementKg: null,
      weightUnit: "kg",
      effortScale: "rpe",
      defaultRestSeconds: 120,
      sessionView: "sets",
      weekStart: "monday",
      previousSource: "same_workout",
      countWarmups: false,
      warmupSteps: [
        { percent: 50, reps: 5 },
        { percent: 70, reps: 3 },
        { percent: 85, reps: 1 },
      ],
      warmupRounding: "equipment",
      durationFormat: "clock",
      distanceUnit: "m",
      sessionsPerWeek: null,
      trainingExperience: null,
      trainingPlace: null,
      muscleGoals: {},
      deloadUntil: null,
      lighterWeeks: [],
      deloadCardDismissedAt: null,
    };
    expect(uiPreferencesSchema.parse({})).toEqual(defaults);
    expect(DEFAULT_UI_PREFERENCES).toEqual(defaults);
  });
  it("keeps saved muscle goals and rejects an inverted Custom range", () => {
    const goals = { chest: { level: "focus" }, calves: { level: "custom", min: 4, max: 9 } };
    expect(uiPreferencesSchema.parse({ muscleGoals: goals }).muscleGoals).toEqual(goals);
    expect(
      uiPreferencesSchema.safeParse({ muscleGoals: { chest: { level: "custom", min: 9, max: 4 } } })
        .success,
    ).toBe(false);
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
  it("keeps other preferences when an older client includes a theme id", () => {
    const ui = { theme: "nord", soundRest: false };
    expect(uiPreferencesSchema.parse(ui)).toEqual({ ...DEFAULT_UI_PREFERENCES, soundRest: false });
    expect(uiPreferencesPatchSchema.parse(ui)).toEqual({ soundRest: false });
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
      lengthUnit: "in",
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

it("validates reminder times and Expo weekdays, and keeps patches sparse", () => {
  const weighInReminder = { enabled: true, time: "07:05" };
  expect(uiPreferencesPatchSchema.parse({ weighInReminder })).toEqual({ weighInReminder });
  for (const time of ["24:00", "08:60", "8:00", "08:00:00", ""]) {
    expect(
      uiPreferencesPatchSchema.safeParse({ weighInReminder: { enabled: true, time } }).success,
    ).toBe(false);
  }
  for (const weekday of [0, 8, 1.5]) {
    expect(
      uiPreferencesPatchSchema.safeParse({
        checkInReminder: { enabled: true, time: "09:00", weekday },
      }).success,
    ).toBe(false);
  }
  expect(uiPreferencesPatchSchema.safeParse({ weighInReminder: { enabled: true } }).success).toBe(
    false,
  );
});

describe("week preferences", () => {
  it("accepts the three week starts and a weekly session goal", () => {
    expect(uiPreferencesSchema.parse({ weekStart: "saturday", sessionsPerWeek: 4 })).toMatchObject({
      weekStart: "saturday",
      sessionsPerWeek: 4,
    });
  });

  it("rejects an unknown week start and an out-of-range goal", () => {
    expect(uiPreferencesSchema.safeParse({ weekStart: "friday" }).success).toBe(false);
    expect(uiPreferencesSchema.safeParse({ sessionsPerWeek: 0 }).success).toBe(false);
    expect(uiPreferencesSchema.safeParse({ sessionsPerWeek: 15 }).success).toBe(false);
  });
});

it("validates the training reminder, report reminder, vibration and cue volume", () => {
  const trainingReminder = { enabled: true, weekdays: [2, 4, 6], time: "18:30" };
  expect(uiPreferencesPatchSchema.parse({ trainingReminder })).toEqual({ trainingReminder });
  expect(
    uiPreferencesPatchSchema.safeParse({ trainingReminder: { ...trainingReminder, weekdays: [8] } })
      .success,
  ).toBe(false);
  expect(
    uiPreferencesPatchSchema.safeParse({ trainingReminder: { ...trainingReminder, time: "7:00" } })
      .success,
  ).toBe(false);
  for (const cueVolume of [-1, 101, 50.5])
    expect(uiPreferencesPatchSchema.safeParse({ cueVolume }).success).toBe(false);
  expect(uiPreferencesPatchSchema.parse({ cueVolume: 0, restVibration: false })).toEqual({
    cueVolume: 0,
    restVibration: false,
  });
});
