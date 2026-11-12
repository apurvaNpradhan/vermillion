import { z } from "zod";

import { localeSchema } from "./locale";
import {
  DEFAULT_REST_SECONDS,
  EFFORT_SCALES,
  REST_SECONDS_MAX,
  SESSION_VIEWS,
  WEIGHT_UNITS,
} from "./training/vocabulary";

/** An IANA time zone name such as `Europe/Berlin`. */
export function isTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export const timezoneSchema = z.string().max(64).refine(isTimeZone, "Must be an IANA time zone");

/**
 * UI preferences stored as `user_preferences.ui`. Every field has a default, so
 * a missing row, a missing key and an old row all read the same way. Unknown
 * keys are dropped. Add new settings here with a default.
 */
const uiFields = {
  bodyweightKg: z.number().min(20).max(400).nullable(),
  keepAwake: z.boolean(),
  sounds: z.boolean(),
  soundRest: z.boolean(),
  soundSets: z.boolean(),
  soundMilestones: z.boolean(),
  sidebarCollapsed: z.boolean(),
  dismissedHints: z.array(z.string().max(100)).max(100),
  weightIncrementKg: z.number().positive().max(100).nullable(),
  weightUnit: z.enum(WEIGHT_UNITS),
  effortScale: z.enum(EFFORT_SCALES),
  defaultRestSeconds: z.number().int().min(0).max(REST_SECONDS_MAX),
  sessionView: z.enum(SESSION_VIEWS),
};
export const uiPreferencesSchema = z
  .object({
    bodyweightKg: uiFields.bodyweightKg.default(null),
    keepAwake: uiFields.keepAwake.default(true),
    sounds: uiFields.sounds.default(true),
    // Optional so a stored value from before the groups existed can be told from a default.
    soundRest: uiFields.soundRest.optional(),
    soundSets: uiFields.soundSets.default(true),
    soundMilestones: uiFields.soundMilestones.default(true),
    /** Legacy: the single "Rest timer sound" switch. Read only to migrate it into `soundRest`. */
    restSound: z.boolean().optional(),
    sidebarCollapsed: uiFields.sidebarCollapsed.default(false),
    dismissedHints: uiFields.dismissedHints.default([]),
    weightIncrementKg: uiFields.weightIncrementKg.default(null),
    weightUnit: uiFields.weightUnit.default("kg"),
    effortScale: uiFields.effortScale.default("rpe"),
    defaultRestSeconds: uiFields.defaultRestSeconds.default(DEFAULT_REST_SECONDS),
    sessionView: uiFields.sessionView.default("sets"),
  })
  // A stored `restSound: false` becomes `soundRest: false`; the legacy key is never returned.
  .transform(({ restSound, soundRest, ...rest }) => ({
    ...rest,
    soundRest: soundRest ?? restSound ?? true,
  }));
export type UiPreferences = z.infer<typeof uiPreferencesSchema>;

/** A sparse update (and the sparse value stored in the database): any subset of the fields. */
export const uiPreferencesPatchSchema = z.object(uiFields).partial();
export type UiPreferencesPatch = z.infer<typeof uiPreferencesPatchSchema>;

export const DEFAULT_UI_PREFERENCES: UiPreferences = uiPreferencesSchema.parse({});

/** What a client reads: the saved values, or null/defaults when nothing is saved. */
export const preferencesSchema = z.object({
  locale: localeSchema.nullable(),
  timezone: timezoneSchema.nullable(),
  ui: uiPreferencesSchema,
});
export type Preferences = z.infer<typeof preferencesSchema>;

/** What a client sends: any subset; `ui` is merged into the saved value. */
export const updatePreferencesSchema = z.object({
  locale: localeSchema.nullable().optional(),
  timezone: timezoneSchema.nullable().optional(),
  ui: uiPreferencesPatchSchema.optional(),
});
export type UpdatePreferences = z.infer<typeof updatePreferencesSchema>;
