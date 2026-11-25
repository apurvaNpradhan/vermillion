import { z } from "zod";

import {
  EXERCISE_TYPES,
  SET_FIELDS,
  type ExerciseType,
  type SetField,
} from "../../exercise/vocabulary";
import { positionKey } from "../vocabulary/inputs";
import { finishClock } from "./session-clock";
import { loadRangesSchema } from "../progress/load-grid";
import { plannedSetSchema, plannedSetsSchema } from "../plans/planned-sets";
import { phaseSchema, phaseSnapshotSchema } from "../phases/phases";
import {
  EFFORT_STEPS,
  MAX_WEIGHT_KG,
  REST_SECONDS_MAX,
  SESSION_LIMITS,
  SET_KINDS,
  WEIGHT_UNITS,
  type EffortStep,
} from "../vocabulary/vocabulary";

const timestamp = z.iso.datetime({ offset: true });
const reference = z.uuid().nullable();
const note = z.string().max(SESSION_LIMITS.noteMax).nullable();
const effortStep = z
  .number()
  .refine((value): value is EffortStep => EFFORT_STEPS.some((step) => step === value), {
    error: "Effort is 6 to 10 in halves",
  });

/** Plans may be deleted while history stays, so the source ids are plain references. */
export const sessionInput = z.strictObject({
  workout_id: reference,
  program_id: reference,
  run_id: reference,
  slot_id: reference,
  /** The gym the Session was trained at; null is any gym (older Sessions, or none chosen). */
  gym_id: reference,
  /** The phase of the Run week the Session started in; null with no phases (older Sessions). */
  phase: phaseSchema.nullable(),
  /**
   * The phase's modifiers as they were when the Session started (see `phaseSnapshotSchema`);
   * null with no phase. The Program's later edits do not change a Session already begun.
   */
  phase_modifiers: phaseSnapshotSchema.nullable(),
  cycle: z.number().int().min(1).max(2_147_483_647).nullable(),
  title: z.string().trim().min(SESSION_LIMITS.titleMin).max(SESSION_LIMITS.titleMax),
  title_derived: z.boolean(),
  note,
  started_at: timestamp,
  finished_at: timestamp.nullable(),
  /** The user's override of the clock duration. */
  duration_s: z.number().int().min(0).max(SESSION_LIMITS.durationMaxSeconds).nullable(),
  device_id: z.uuid(),
  rest_set_id: reference,
  rest_started_at: timestamp.nullable(),
  rest_ends_at: timestamp.nullable(),
  /** When the current pause began; null while the Session runs. */
  paused_at: timestamp.nullable(),
  /** Milliseconds of earlier pauses, which the duration leaves out. */
  paused_ms: z.int().nonnegative(),
});
export type SessionInput = z.infer<typeof sessionInput>;

/**
 * A Session never ends before it starts, a pause never begins before it, and a running Rest has
 * both of its times.
 */
export function sessionTimesConsistent(
  session: Pick<
    SessionInput,
    "started_at" | "finished_at" | "rest_started_at" | "rest_ends_at" | "paused_at"
  >,
): boolean {
  const { started_at, finished_at, rest_started_at, rest_ends_at, paused_at } = session;
  if (finished_at !== null && Date.parse(finished_at) < Date.parse(started_at)) return false;
  if (paused_at !== null && Date.parse(paused_at) < Date.parse(started_at)) return false;
  if ((rest_started_at === null) !== (rest_ends_at === null)) return false;
  return (
    rest_started_at === null ||
    rest_ends_at === null ||
    Date.parse(rest_ends_at) >= Date.parse(rest_started_at)
  );
}

/**
 * A finished Session is not paused: a pause still open at the finish (an older app finished the
 * Session another install had paused) is settled into `paused_ms` as of the finish time.
 */
export function settleFinishedPause<
  T extends Pick<SessionInput, "started_at" | "finished_at" | "paused_at" | "paused_ms">,
>(session: T): T {
  if (session.finished_at === null || session.paused_at === null) return session;
  const settled = finishClock(
    { startedAt: session.started_at, pausedAt: session.paused_at, pausedMs: session.paused_ms },
    Date.parse(session.finished_at),
  );
  return { ...session, paused_at: null, paused_ms: settled.pausedMs };
}

/**
 * Whether a Session may start at `value`: not before `backfillYears` ago and not in the future
 * (beyond a small clock-skew grace).
 */
export function sessionStartAllowed(value: string, now: Date = new Date()): boolean {
  const at = Date.parse(value);
  if (Number.isNaN(at)) return false;
  return (
    at >= backfillEarliestMs(now) && at <= now.getTime() + SESSION_LIMITS.futureGraceSeconds * 1000
  );
}

/** The earliest start a Session may have: `backfillYears` before `now`, in ms. */
export function backfillEarliestMs(now: Date = new Date()): number {
  const earliest = new Date(now);
  earliest.setUTCFullYear(earliest.getUTCFullYear() - SESSION_LIMITS.backfillYears);
  return earliest.getTime();
}

/** The exercise's title and type are snapshots, so history reads without the library. */
export const sessionExerciseInput = z.strictObject({
  session_id: z.uuid(),
  exercise_id: z.uuid(),
  exercise_title: z.string().min(1).max(100),
  exercise_type: z.enum(EXERCISE_TYPES),
  source_workout_exercise_id: reference,
  position: positionKey,
  rest_seconds: z.number().int().min(0).max(REST_SECONDS_MAX).nullable(),
  note,
  superset_group: reference,
  log_effort: z.boolean(),
});
export type SessionExerciseInput = z.infer<typeof sessionExerciseInput>;

/** What a Logged set holds as actuals; `null` is empty. */
export const actualValuesSchema = z.strictObject({
  weight_kg: z.number().min(0).max(MAX_WEIGHT_KG).nullable(),
  reps: z.number().int().min(1).max(999).nullable(),
  duration_s: z.number().int().min(1).max(86_400).nullable(),
  distance_m: z.number().min(0).max(1_000_000).nullable(),
  floors: z.number().int().min(1).max(10_000).nullable(),
  steps: z.number().int().min(1).max(1_000_000).nullable(),
  rpe: effortStep.nullable(),
});
export type ActualValues = z.infer<typeof actualValuesSchema>;
export type ActualKey = keyof ActualValues;

/** The column that records each field of `SET_FIELDS`. */
export const SET_VALUE_KEYS = {
  weight: "weight_kg",
  reps: "reps",
  duration: "duration_s",
  distance: "distance_m",
  floors: "floors",
  steps: "steps",
} as const satisfies Record<SetField, ActualKey>;

/**
 * Whether a cell holds a usable value for a completed set. Weight may be 0 (the bar, no
 * assistance); every other field must be positive.
 */
export function fieldHasValue(field: SetField, value: number | null | undefined): boolean {
  if (value === null || value === undefined || !Number.isFinite(value)) return false;
  return field === "weight" ? value >= 0 : value > 0;
}

/** `exercise_type`-independent shape; {@link sessionSetSchema} adds what the type allows. */
export const sessionSetInput = z.strictObject({
  session_exercise_id: z.uuid(),
  position: positionKey,
  kind: z.enum(SET_KINDS),
  ...actualValuesSchema.shape,
  completed_at: timestamp.nullable(),
  timer_started_at: timestamp.nullable(),
  /** The Planned set this one was copied from; null for a set added in the session. */
  target: plannedSetSchema.nullable(),
});
export type SessionSetInput = z.infer<typeof sessionSetInput>;

const ACTUAL_KEYS = [
  "weight_kg",
  "reps",
  "duration_s",
  "distance_m",
  "floors",
  "steps",
  "rpe",
] as const satisfies readonly ActualKey[];

const setSchemas = new Map<ExerciseType, ReturnType<typeof buildSetSchema>>();

function buildSetSchema(type: ExerciseType) {
  const fields: readonly SetField[] = SET_FIELDS[type];
  const allowed = new Set<ActualKey>(fields.map((field) => SET_VALUE_KEYS[field]));
  if (fields.includes("reps")) allowed.add("rpe");
  return sessionSetInput.superRefine((set, ctx) => {
    for (const key of ACTUAL_KEYS) {
      if (set[key] !== null && !allowed.has(key)) {
        ctx.addIssue({ code: "custom", path: [key], error: `${type} does not record ${key}` });
      }
    }
    if (set.completed_at !== null) {
      for (const field of fields) {
        const key = SET_VALUE_KEYS[field];
        if (!fieldHasValue(field, set[key])) {
          ctx.addIssue({ code: "custom", path: [key], error: "A ticked set needs this value" });
        }
      }
    }
    if (set.target !== null && !plannedSetsSchema(type).safeParse([set.target]).success) {
      ctx.addIssue({ code: "custom", path: ["target"], error: `${type} does not plan that` });
    }
  });
}

/**
 * One Logged set of an exercise type: only the fields `SET_FIELDS` lists for it (plus effort on
 * reps types), a ticked set holds a value for each of them, and its target fits the type too.
 */
export function sessionSetSchema(type: ExerciseType) {
  const existing = setSchemas.get(type);
  if (existing) return existing;
  const created = buildSetSchema(type);
  setSchemas.set(type, created);
  return created;
}

/** A bar or a plate of the user's kit; `count` null means unlimited. */
export const gymEquipmentInput = z
  .strictObject({
    kind: z.enum(["bar", "plate"]),
    weight_kg: z.number().min(0).max(MAX_WEIGHT_KG),
    unit: z.enum(WEIGHT_UNITS),
    label: z.string().min(1).max(100).nullable(),
    count: z.number().int().min(1).max(1000).nullable(),
    enabled: z.boolean(),
  })
  .refine((item) => item.kind === "bar" || item.weight_kg > 0, {
    path: ["weight_kg"],
    message: "A plate must weigh more than zero",
  });
export type GymEquipmentInput = z.infer<typeof gymEquipmentInput>;

/** The most gyms one user keeps, and the longest gym name. */
export const GYM_LIMITS = { nameMax: 60 } as const;

/** A gym: a place the user trains, with its own kit and exercise limits. */
export const gymInput = z.strictObject({
  name: z.string().trim().min(1).max(GYM_LIMITS.nameMax),
});
export type GymInput = z.infer<typeof gymInput>;

/**
 * What one gym says about one exercise: the loads it can make (ranges whose last `max` is the
 * cap) and a free-text setup note, such as the seat position of a machine.
 */
export const gymExerciseSettingInput = z.strictObject({
  gym_id: z.uuid(),
  exercise_id: z.uuid(),
  load_ranges: loadRangesSchema,
  setup_note: note,
});
export type GymExerciseSettingInput = z.infer<typeof gymExerciseSettingInput>;

/** Per exercise: the remembered bar and whether the effort column is on. One row per exercise. */
export const exerciseSettingInput = z.strictObject({
  exercise_id: z.uuid(),
  bar_id: z.uuid().nullable(),
  log_effort: z.boolean(),
  unit: z.enum(WEIGHT_UNITS).nullable().optional(),
  progression_per_set: z.boolean().default(false),
  auto_warmups: z.boolean().default(false),
  /** The pinned note shown under the exercise name wherever it appears. */
  note: note.default(null),
});
export type ExerciseSettingInput = z.infer<typeof exerciseSettingInput>;
