import { z } from "zod";

import { BODY_METRICS, DEFAULT_TRACKED_METRICS } from "./body";
import { localeSchema } from "./locale";
import {
  DEFAULT_REST_SECONDS,
  DEFAULT_WEEK_START,
  EFFORT_SCALES,
  TRAINING_LIMITS,
  WEEK_STARTS,
  REST_SECONDS_MAX,
  SESSION_VIEWS,
  WEIGHT_UNITS,
  DEFAULT_PREVIOUS_SOURCE,
  DISTANCE_UNITS,
  DURATION_FORMATS,
  PREVIOUS_SOURCES,
} from "./training/vocabulary/vocabulary";
import { TRAINING_EXPERIENCES, TRAINING_PLACES } from "./training/vocabulary/profile";
import {
  DEFAULT_WARMUP_STEPS,
  WARMUP_ROUNDINGS,
  warmupStepsSchema,
} from "./training/logging/warmup-ramp";
import { lighterPeriodSchema, LIGHTER_WEEKS_KEPT } from "./training/progress/lighter-week";
import {
  muscleGoalSchema,
  muscleGoalsSchema,
  TARGET_MUSCLES,
} from "./training/volume/muscle-targets";

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
const reminderTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const weighInReminder = z.object({ enabled: z.boolean(), time: reminderTime });
const checkInReminder = weighInReminder.extend({ weekday: z.number().int().min(1).max(7) });

const uiFields = {
  weighInReminder,
  checkInReminder,
  avatarMediaId: z.uuid().nullable(),
  lengthUnit: z.enum(["cm", "in"]),
  heightCm: z.number().min(100).max(250).nullable(),
  trackedMetrics: z.array(z.enum(BODY_METRICS)).max(14),
  weightGoalKg: z.number().min(20).max(400).nullable(),
  bodyweightKg: z.number().min(20).max(400).nullable(),
  hidePhotos: z.boolean(),
  keepAwake: z.boolean(),
  sounds: z.boolean(),
  soundRest: z.boolean(),
  soundSets: z.boolean(),
  soundMilestones: z.boolean(),
  systemKeyboard: z.boolean(),
  /** Deprecated: timed sets always show their start button. Kept so stored values validate. */
  inlineTimer: z.boolean(),
  supersetScroll: z.boolean(),
  recordAlerts: z.boolean(),
  sidebarCollapsed: z.boolean(),
  dismissedHints: z.array(z.string().max(100)).max(100),
  weightIncrementKg: z.number().positive().max(100).nullable(),
  weightUnit: z.enum(WEIGHT_UNITS),
  effortScale: z.enum(EFFORT_SCALES),
  defaultRestSeconds: z.number().int().min(0).max(REST_SECONDS_MAX),
  /** Deprecated: no setting reads it any more. Kept so stored values validate. */
  sessionView: z.enum(SESSION_VIEWS),
  weekStart: z.enum(WEEK_STARTS),
  previousSource: z.enum(PREVIOUS_SOURCES),
  countWarmups: z.boolean(),
  warmupSteps: warmupStepsSchema,
  warmupRounding: z.enum(WARMUP_ROUNDINGS),
  durationFormat: z.enum(DURATION_FORMATS),
  distanceUnit: z.enum(DISTANCE_UNITS),
  muscleGoals: muscleGoalsSchema,
  deloadUntil: z.iso.datetime().nullable(),
  lighterWeeks: z.array(lighterPeriodSchema).max(LIGHTER_WEEKS_KEPT),
  deloadCardDismissedAt: z.iso.datetime().nullable(),
  sessionsPerWeek: z
    .number()
    .int()
    .min(TRAINING_LIMITS.sessionsPerWeekMin)
    .max(TRAINING_LIMITS.sessionsPerWeekMax)
    .nullable(),
  trainingExperience: z.enum(TRAINING_EXPERIENCES).nullable(),
  trainingPlace: z.enum(TRAINING_PLACES).nullable(),
};
export const uiPreferencesSchema = z
  .object({
    weighInReminder: uiFields.weighInReminder.default({ enabled: false, time: "08:00" }),
    checkInReminder: uiFields.checkInReminder.default({
      enabled: false,
      weekday: 1,
      time: "09:00",
    }),
    lengthUnit: uiFields.lengthUnit.optional(),
    avatarMediaId: uiFields.avatarMediaId.default(null),
    heightCm: uiFields.heightCm.default(null),
    trackedMetrics: uiFields.trackedMetrics.default(DEFAULT_TRACKED_METRICS),
    weightGoalKg: uiFields.weightGoalKg.default(null),
    bodyweightKg: uiFields.bodyweightKg.default(null),
    // Progress photos stay blurred in lists until tapped (ADR 0041).
    hidePhotos: uiFields.hidePhotos.default(true),
    keepAwake: uiFields.keepAwake.default(true),
    sounds: uiFields.sounds.default(true),
    // Optional so a stored value from before the groups existed can be told from a default.
    soundRest: uiFields.soundRest.optional(),
    soundSets: uiFields.soundSets.default(true),
    soundMilestones: uiFields.soundMilestones.default(true),
    // Logging controls: the number pad is ours unless the system keyboard is asked for.
    systemKeyboard: uiFields.systemKeyboard.default(false),
    inlineTimer: uiFields.inlineTimer.default(true),
    supersetScroll: uiFields.supersetScroll.default(true),
    recordAlerts: uiFields.recordAlerts.default(true),
    /** Legacy: the single "Rest timer sound" switch. Read only to migrate it into `soundRest`. */
    restSound: z.boolean().optional(),
    sidebarCollapsed: uiFields.sidebarCollapsed.default(false),
    dismissedHints: uiFields.dismissedHints.default([]),
    weightIncrementKg: uiFields.weightIncrementKg.default(null),
    weightUnit: uiFields.weightUnit.default("kg"),
    effortScale: uiFields.effortScale.default("rpe"),
    defaultRestSeconds: uiFields.defaultRestSeconds.default(DEFAULT_REST_SECONDS),
    sessionView: uiFields.sessionView.default("sets"),
    weekStart: uiFields.weekStart.default(DEFAULT_WEEK_START),
    // Where Previous values come from; warm-ups stay out of the numbers unless counted.
    previousSource: uiFields.previousSource.default(DEFAULT_PREVIOUS_SOURCE),
    countWarmups: uiFields.countWarmups.default(false),
    warmupSteps: uiFields.warmupSteps.default([...DEFAULT_WARMUP_STEPS]),
    warmupRounding: uiFields.warmupRounding.default("equipment"),
    durationFormat: uiFields.durationFormat.default("clock"),
    distanceUnit: uiFields.distanceUnit.default("m"),
    // Only muscles whose goal level was changed; a missing muscle is on Grow.
    muscleGoals: uiFields.muscleGoals.default({}),
    // The running Lighter week ends here (null when none), every Lighter week so far is in
    // `lighterWeeks` (their Sessions are no baseline), and the Home card was dismissed at this time.
    deloadUntil: uiFields.deloadUntil.default(null),
    lighterWeeks: uiFields.lighterWeeks.default([]),
    deloadCardDismissedAt: uiFields.deloadCardDismissedAt.default(null),
    sessionsPerWeek: uiFields.sessionsPerWeek.default(null),
    // Onboarding answers, editable in Settings. They only choose defaults (the warm-up ramp, the
    // first bars and plates); null means never answered.
    trainingExperience: uiFields.trainingExperience.default(null).catch(null),
    trainingPlace: uiFields.trainingPlace.default(null).catch(null),
  })
  // A stored `restSound: false` becomes `soundRest: false`; the legacy key is never returned.
  .transform(({ restSound, soundRest, ...rest }) => ({
    ...rest,
    lengthUnit: rest.lengthUnit ?? (rest.weightUnit === "lb" ? "in" : "cm"),
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
  /**
   * Per-muscle goal edits, merged into `ui.muscleGoals` one muscle at a time: a goal sets that
   * muscle, `null` resets it to the default. Unlike `ui.muscleGoals` (the whole map, which
   * overwrites), it never touches a muscle another device edited. Applied after `ui` when both
   * are sent.
   */
  muscleGoalChanges: z
    .partialRecord(z.enum(TARGET_MUSCLES), muscleGoalSchema.nullable())
    .optional(),
});
export type UpdatePreferences = z.infer<typeof updatePreferencesSchema>;
