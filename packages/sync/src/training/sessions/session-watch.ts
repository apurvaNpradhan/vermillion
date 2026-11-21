import {
  EQUIPMENT,
  EXERCISE_TYPES,
  MUSCLE_GROUPS,
  SET_KINDS,
  plannedSetSchema,
  type Equipment,
  type ExerciseType,
  type LoggedSet,
  type MuscleGroup,
  type PlannedSet,
  type SessionHistory,
  type SetKind,
  type WeightUnit,
} from "@workspace/shared";
import { z } from "zod";

/** Sessions the history reads load at most this many, newest first. */
export const SESSION_READ_LIMIT = 500;
const ACTIVE_LIMIT = 50;
const EQUIPMENT_LIMIT = 200;
const DETAIL_ROW_LIMIT = 1000;

const jsonText = z.string().transform((text, context) => {
  try {
    return JSON.parse(text);
  } catch {
    context.addIssue({ code: "custom", message: "Not JSON" });
    return z.NEVER;
  }
});
/** SQLite keeps booleans as 0/1. */
const flag = z.number().transform((value) => value !== 0);
const secondaryText = jsonText
  .pipe(z.array(z.enum(MUSCLE_GROUPS)))
  .nullable()
  .optional()
  .transform((value) => value ?? []);
const targetText = jsonText.pipe(plannedSetSchema.nullable()).nullable();
const kind = z.enum(SET_KINDS);

// ---- Active Sessions ----

/** An unfinished Session with what the Resume bar and the forgotten-session check need. */
export type ActiveSession = {
  id: string;
  workoutId: string | null;
  title: string;
  titleDerived: boolean;
  startedAt: string;
  /** The install that owns it; another device shows it read-only with Take over. */
  deviceId: string;
  restSetId: string | null;
  restStartedAt: string | null;
  restEndsAt: string | null;
  exerciseCount: number;
  totalSets: number;
  tickedSets: number;
  /** When the latest set was ticked; null before the first. */
  lastTickedAt: string | null;
};

export const ACTIVE_SESSIONS_SQL = `SELECT s.id AS id, s.workout_id AS workout_id, s.title AS title,
    s.title_derived AS title_derived, s.started_at AS started_at, s.device_id AS device_id,
    s.rest_set_id AS rest_set_id, s.rest_started_at AS rest_started_at, s.rest_ends_at AS rest_ends_at,
    COUNT(DISTINCT se.id) AS exercise_count, COUNT(ss.id) AS total_sets,
    COUNT(ss.completed_at) AS ticked_sets, MAX(ss.completed_at) AS last_ticked_at
  FROM training_session s
  LEFT JOIN session_exercise se ON se.session_id = s.id
  LEFT JOIN session_set ss ON ss.session_exercise_id = se.id
  WHERE s.finished_at IS NULL
  GROUP BY s.id
  ORDER BY s.started_at DESC, s.id DESC
  LIMIT ${ACTIVE_LIMIT}`;

const activeRowSchema = z.object({
  id: z.string(),
  workout_id: z.string().nullable(),
  title: z.string(),
  title_derived: flag,
  started_at: z.string(),
  device_id: z.string(),
  rest_set_id: z.string().nullable(),
  rest_started_at: z.string().nullable(),
  rest_ends_at: z.string().nullable(),
  exercise_count: z.number(),
  total_sets: z.number(),
  ticked_sets: z.number(),
  last_ticked_at: z.string().nullable(),
});

export function parseActiveSessions(rows: readonly object[]): ActiveSession[] {
  return z
    .array(activeRowSchema)
    .parse(rows)
    .map((row) => ({
      id: row.id,
      workoutId: row.workout_id,
      title: row.title,
      titleDerived: row.title_derived,
      startedAt: row.started_at,
      deviceId: row.device_id,
      restSetId: row.rest_set_id,
      restStartedAt: row.rest_started_at,
      restEndsAt: row.rest_ends_at,
      exerciseCount: row.exercise_count,
      totalSets: row.total_sets,
      tickedSets: row.ticked_sets,
      lastTickedAt: row.last_ticked_at,
    }));
}

// ---- One Session ----

export type SessionSetDetail = {
  id: string;
  position: string;
  kind: SetKind;
  weightKg: number | null;
  reps: number | null;
  durationS: number | null;
  distanceM: number | null;
  floors: number | null;
  steps: number | null;
  rpe: number | null;
  completedAt: string | null;
  timerStartedAt: string | null;
  /** The Planned set it was copied from; null for a set added in the Session. */
  target: PlannedSet | null;
  /** Written by the warm-up ramp generator and not touched since: not something the user chose. */
  generatedWarmup: boolean;
};

export type SessionExerciseDetail = {
  id: string;
  exerciseId: string;
  /** Snapshots: history reads without the library. */
  title: string;
  type: ExerciseType;
  sourceWorkoutExerciseId: string | null;
  workoutSwapFragment?: boolean;
  position: string;
  restSeconds: number | null;
  note: string | null;
  /** The exercise's pinned note (one per exercise), or null. */
  pinnedNote: string | null;
  /** The note this exercise had in the latest earlier finished Session, or null. */
  lastNote: string | null;
  supersetGroup: string | null;
  logEffort: boolean;
  progressionPerSet: boolean;
  /** The exercise's setting: generate a warm-up ramp from the first working weight. */
  autoWarmups: boolean;
  /** The inputs the generated ramp was last built from; null before the first one. */
  warmupKey: string | null;
  /** Made by Perform again: its copied targets outrank Previous for the Ghost values. */
  repeated: boolean;
  /** The bar the exercise remembers, if any. */
  barId: string | null;
  /** The library's current data (muscles, media); null while it has not arrived on this device. */
  exercise: {
    primaryMuscle: MuscleGroup;
    secondaryMuscles: MuscleGroup[];
    equipment: Equipment;
    thumbnailKey: string | null;
    imageMediaId?: string | null;
  } | null;
  sets: SessionSetDetail[];
};

export type SessionDetail = {
  id: string;
  workoutId: string | null;
  workoutStructure: string | null;
  programId: string | null;
  runId: string | null;
  slotId: string | null;
  cycle: number | null;
  title: string;
  titleDerived: boolean;
  note: string | null;
  /** The note of the Workout this Session started from, if it has one. */
  workoutNote: string | null;
  startedAt: string;
  finishedAt: string | null;
  /** The user's override of the clock duration. */
  durationS: number | null;
  deviceId: string;
  rest: { setId: string; startedAt: string; endsAt: string } | null;
  exercises: SessionExerciseDetail[];
};

export const SESSION_DETAIL_SQL = `SELECT s.id AS id, s.workout_id AS workout_id, s.program_id AS program_id,
    s.workout_structure AS workout_structure,
    s.run_id AS run_id, s.slot_id AS slot_id, s.cycle AS cycle, s.title AS title,
    s.title_derived AS title_derived, s.note AS note,
    (SELECT w.note FROM workout w WHERE w.id = s.workout_id) AS workout_note, s.started_at AS started_at,
    s.finished_at AS finished_at, s.duration_s AS duration_s, s.device_id AS device_id,
    s.rest_set_id AS rest_set_id, s.rest_started_at AS rest_started_at, s.rest_ends_at AS rest_ends_at,
    se.id AS exercise_row, se.exercise_id AS exercise_id, se.exercise_title AS exercise_title,
    se.exercise_type AS exercise_type, se.source_workout_exercise_id AS source_workout_exercise_id,
    se.workout_swap_fragment AS workout_swap_fragment, se.position AS exercise_position, se.rest_seconds AS rest_seconds, se.note AS exercise_note,
    se.superset_group AS superset_group, se.log_effort AS log_effort, se.warmup_key AS warmup_key, se.repeated AS repeated,
    (SELECT progression_per_set FROM exercise_setting
      WHERE exercise_id = se.exercise_id ORDER BY id LIMIT 1) AS progression_per_set,
    (SELECT bar_id FROM exercise_setting
      WHERE exercise_id = se.exercise_id ORDER BY id LIMIT 1) AS bar_id,
    (SELECT auto_warmups FROM exercise_setting
      WHERE exercise_id = se.exercise_id ORDER BY id LIMIT 1) AS auto_warmups,
    (SELECT note FROM exercise_setting
      WHERE exercise_id = se.exercise_id ORDER BY id LIMIT 1) AS pinned_note,
    (SELECT se2.note FROM session_exercise se2
      JOIN training_session s2 ON s2.id = se2.session_id
      WHERE se2.exercise_id = se.exercise_id AND s2.id != s.id AND s2.finished_at IS NOT NULL
        AND s2.started_at < s.started_at
      ORDER BY s2.started_at DESC, s2.id DESC LIMIT 1) AS last_note,
    e.primary_muscle AS primary_muscle, e.secondary_muscles AS secondary_muscles,
    e.equipment AS equipment, e.thumbnail_key AS thumbnail_key, e.image_media_id AS image_media_id,
    ss.id AS set_row, ss.position AS set_position, ss.kind AS kind, ss.weight_kg AS weight_kg,
    ss.reps AS reps, ss.duration_s AS set_duration_s, ss.distance_m AS distance_m,
    ss.floors AS floors, ss.steps AS steps, ss.rpe AS rpe, ss.completed_at AS completed_at,
    ss.timer_started_at AS timer_started_at, ss.target AS target,
    ss.generated_warmup AS generated_warmup
  FROM training_session s
  LEFT JOIN session_exercise se ON se.session_id = s.id
  LEFT JOIN exercise e ON e.id = se.exercise_id
  LEFT JOIN session_set ss ON ss.session_exercise_id = se.id
  WHERE s.id = ?
  ORDER BY se.position, se.id, ss.position, ss.id
  LIMIT ${DETAIL_ROW_LIMIT}`;

const detailRowSchema = z.object({
  id: z.string(),
  workout_id: z.string().nullable(),
  workout_structure: z.string().nullable(),
  program_id: z.string().nullable(),
  run_id: z.string().nullable(),
  slot_id: z.string().nullable(),
  cycle: z.number().nullable(),
  title: z.string(),
  title_derived: flag,
  note: z.string().nullable(),
  workout_note: z.string().nullable(),
  started_at: z.string(),
  finished_at: z.string().nullable(),
  duration_s: z.number().nullable(),
  device_id: z.string(),
  rest_set_id: z.string().nullable(),
  rest_started_at: z.string().nullable(),
  rest_ends_at: z.string().nullable(),
  exercise_row: z.string().nullable(),
  exercise_id: z.string().nullable(),
  exercise_title: z.string().nullable(),
  exercise_type: z.enum(EXERCISE_TYPES).nullable(),
  source_workout_exercise_id: z.string().nullable(),
  workout_swap_fragment: flag.nullable(),
  exercise_position: z.string().nullable(),
  rest_seconds: z.number().nullable(),
  exercise_note: z.string().nullable(),
  superset_group: z.string().nullable(),
  log_effort: flag.nullable(),
  progression_per_set: flag.nullable(),
  auto_warmups: flag.nullable(),
  pinned_note: z.string().nullable(),
  last_note: z.string().nullable(),
  warmup_key: z.string().nullable(),
  repeated: flag.nullable(),
  bar_id: z.string().nullable(),
  primary_muscle: z.enum(MUSCLE_GROUPS).nullable(),
  secondary_muscles: secondaryText,
  equipment: z.enum(EQUIPMENT).nullable(),
  thumbnail_key: z.string().nullable(),
  image_media_id: z.string().nullable().optional(),
  set_row: z.string().nullable(),
  set_position: z.string().nullable(),
  kind: kind.nullable(),
  weight_kg: z.number().nullable(),
  reps: z.number().nullable(),
  set_duration_s: z.number().nullable(),
  distance_m: z.number().nullable(),
  floors: z.number().nullable(),
  steps: z.number().nullable(),
  rpe: z.number().nullable(),
  completed_at: z.string().nullable(),
  timer_started_at: z.string().nullable(),
  target: targetText,
  generated_warmup: flag.nullable(),
});

/** A note that is only whitespace counts as no note. */
const nonEmpty = (note: string | null): string | null =>
  note !== null && note.trim() !== "" ? note : null;

/** Builds one Session from the joined rows of {@link SESSION_DETAIL_SQL}; null if there is none. */
export function parseSessionDetail(rows: readonly object[]): SessionDetail | null {
  const parsed = z.array(detailRowSchema).parse(rows);
  const first = parsed[0];
  if (first === undefined) return null;
  const exercises: SessionExerciseDetail[] = [];
  for (const row of parsed) {
    if (
      row.exercise_row === null ||
      row.exercise_id === null ||
      row.exercise_title === null ||
      row.exercise_type === null ||
      row.exercise_position === null
    ) {
      continue;
    }
    let entry = exercises.at(-1);
    if (entry?.id !== row.exercise_row) {
      entry = {
        id: row.exercise_row,
        exerciseId: row.exercise_id,
        title: row.exercise_title,
        type: row.exercise_type,
        sourceWorkoutExerciseId: row.source_workout_exercise_id,
        workoutSwapFragment: row.workout_swap_fragment === true,
        position: row.exercise_position,
        restSeconds: row.rest_seconds,
        note: row.exercise_note,
        pinnedNote: nonEmpty(row.pinned_note),
        lastNote: nonEmpty(row.last_note),
        supersetGroup: row.superset_group,
        logEffort: row.log_effort ?? false,
        progressionPerSet: row.progression_per_set ?? false,
        autoWarmups: row.auto_warmups ?? false,
        warmupKey: row.warmup_key,
        repeated: row.repeated ?? false,
        barId: row.bar_id,
        exercise:
          row.primary_muscle !== null && row.equipment !== null
            ? {
                primaryMuscle: row.primary_muscle,
                secondaryMuscles: row.secondary_muscles,
                equipment: row.equipment,
                thumbnailKey: row.thumbnail_key,
                imageMediaId: row.image_media_id ?? null,
              }
            : null,
        sets: [],
      };
      exercises.push(entry);
    }
    if (row.set_row !== null && row.set_position !== null && row.kind !== null) {
      entry.sets.push({
        id: row.set_row,
        position: row.set_position,
        kind: row.kind,
        weightKg: row.weight_kg,
        reps: row.reps,
        durationS: row.set_duration_s,
        distanceM: row.distance_m,
        floors: row.floors,
        steps: row.steps,
        rpe: row.rpe,
        completedAt: row.completed_at,
        timerStartedAt: row.timer_started_at,
        target: row.target,
        generatedWarmup: row.generated_warmup ?? false,
      });
    }
  }
  return {
    id: first.id,
    workoutId: first.workout_id,
    workoutStructure: first.workout_structure,
    programId: first.program_id,
    runId: first.run_id,
    slotId: first.slot_id,
    cycle: first.cycle,
    title: first.title,
    titleDerived: first.title_derived,
    note: first.note,
    workoutNote: nonEmpty(first.workout_note),
    startedAt: first.started_at,
    finishedAt: first.finished_at,
    durationS: first.duration_s,
    deviceId: first.device_id,
    rest:
      first.rest_set_id !== null && first.rest_started_at !== null && first.rest_ends_at !== null
        ? { setId: first.rest_set_id, startedAt: first.rest_started_at, endsAt: first.rest_ends_at }
        : null,
    exercises,
  };
}

// ---- Finished Sessions with their ticked sets: history, Previous, Records, ranges ----

/** A finished Session with its ticked sets (warm-ups included), ready for the shared numbers. */
export type FinishedSession = Omit<SessionHistory, "sets"> & {
  sets: LoggedSet[];
  title: string;
  durationS: number | null;
  workoutId: string | null;
  exerciseTitles?: string[];
};

const SET_COLUMNS = `s.id AS session_id, s.title AS title, s.started_at AS started_at,
    s.finished_at AS finished_at, s.duration_s AS duration_s, s.workout_id AS workout_id,
    se.exercise_id AS exercise_id, se.exercise_type AS exercise_type, se.exercise_title AS exercise_title,
    ss.id AS set_id, ss.kind AS kind, ss.weight_kg AS weight_kg, ss.reps AS reps,
    ss.duration_s AS set_duration_s, ss.distance_m AS distance_m, ss.floors AS floors,
    ss.steps AS steps, ss.rpe AS rpe, ss.completed_at AS completed_at`;

const SET_ORDER = "ORDER BY s.started_at DESC, s.id DESC, se.position, se.id, ss.position, ss.id";

/**
 * The finished Sessions containing an exercise, newest first, each with that exercise's ticked
 * sets (warm-ups and counted). Reads at most {@link SESSION_READ_LIMIT} Sessions.
 */
export const EXERCISE_HISTORY_SQL = `SELECT ${SET_COLUMNS}
  FROM training_session s
  JOIN session_exercise se ON se.session_id = s.id AND se.exercise_id = ?
  JOIN session_set ss ON ss.session_exercise_id = se.id AND ss.completed_at IS NOT NULL
  WHERE s.finished_at IS NOT NULL AND s.id IN (
    SELECT s2.id FROM training_session s2
    JOIN session_exercise se2 ON se2.session_id = s2.id AND se2.exercise_id = ?
    WHERE s2.finished_at IS NOT NULL
    ORDER BY s2.started_at DESC, s2.id DESC LIMIT ${SESSION_READ_LIMIT})
  ${SET_ORDER}`;

/**
 * {@link EXERCISE_HISTORY_SQL} for several exercises in one query (a Session screen reads every
 * exercise's history, and one query per exercise re-runs them all on every write). Each exercise
 * keeps its own {@link SESSION_READ_LIMIT}. Takes the exercise ids twice, as
 * `[...ids, ...ids]`; split the rows with {@link parseExerciseHistories}.
 */
export function exerciseHistoriesSql(count: number): string {
  const ids = Array.from({ length: Math.max(1, count) }, () => "?").join(", ");
  return `SELECT ${SET_COLUMNS}
  FROM training_session s
  JOIN session_exercise se ON se.session_id = s.id AND se.exercise_id IN (${ids})
  JOIN session_set ss ON ss.session_exercise_id = se.id AND ss.completed_at IS NOT NULL
  WHERE s.finished_at IS NOT NULL AND (se.exercise_id, s.id) IN (
    SELECT exercise_id, id FROM (
      SELECT exercise_id, id, ROW_NUMBER() OVER (
        PARTITION BY exercise_id ORDER BY started_at DESC, id DESC) AS rank
      FROM (
        SELECT DISTINCT se2.exercise_id AS exercise_id, s2.id AS id, s2.started_at AS started_at
        FROM training_session s2
        JOIN session_exercise se2 ON se2.session_id = s2.id AND se2.exercise_id IN (${ids})
        WHERE s2.finished_at IS NOT NULL))
    WHERE rank <= ${SESSION_READ_LIMIT})
  ${SET_ORDER}`;
}

/** Splits the rows of {@link exerciseHistoriesSql} into each exercise's finished Sessions. */
export function parseExerciseHistories(rows: readonly object[]): Map<string, FinishedSession[]> {
  const byExercise = new Map<string, object[]>();
  for (const row of rows) {
    const { exercise_id: id } = z.object({ exercise_id: z.string() }).parse(row);
    const list = byExercise.get(id);
    if (list) list.push(row);
    else byExercise.set(id, [row]);
  }
  return new Map([...byExercise].map(([id, list]) => [id, parseFinishedSessions(list)]));
}

/**
 * The finished Sessions that started in `[from, to)`, newest first, each with all of its ticked
 * sets. Reads at most {@link SESSION_READ_LIMIT} Sessions; one with no ticked set has no sets.
 */
export const SESSIONS_BETWEEN_SQL = `SELECT ${SET_COLUMNS}
  FROM training_session s
  LEFT JOIN session_exercise se ON se.session_id = s.id
  LEFT JOIN session_set ss ON ss.session_exercise_id = se.id AND ss.completed_at IS NOT NULL
  WHERE s.id IN (
    SELECT s2.id FROM training_session s2
    WHERE s2.finished_at IS NOT NULL AND s2.started_at >= ? AND s2.started_at < ?
    ORDER BY s2.started_at DESC, s2.id DESC LIMIT ${SESSION_READ_LIMIT})
  ${SET_ORDER}`;

/** A half-open `[from, to)` range of Session start times (ISO). */
export type HistoryRange = { from: string; to: string };

/** The most Sessions a count read returns; far above what one window of weeks can hold. */
const SESSION_COUNT_LIMIT = 5000;

/**
 * One row per finished Session that started in `[from, to)`: when it started and how many Counted
 * sets (ticked, not warm-up) it has. A calendar-heat read needs no set rows, so this is the
 * bounded alternative to {@link SESSIONS_BETWEEN_SQL}: it is not capped at
 * {@link SESSION_READ_LIMIT} Sessions. The caller buckets `started_at` by the account's time zone,
 * which SQLite cannot do.
 */
export const SESSION_SET_COUNTS_SQL = `SELECT s.started_at AS started_at, COUNT(ss.id) AS sets
  FROM training_session s
  JOIN session_exercise se ON se.session_id = s.id
  JOIN session_set ss ON ss.session_exercise_id = se.id
    AND ss.completed_at IS NOT NULL AND ss.kind <> 'warmup'
  WHERE s.finished_at IS NOT NULL AND s.started_at >= ? AND s.started_at < ?
  GROUP BY s.id
  ORDER BY s.started_at DESC, s.id DESC LIMIT ${SESSION_COUNT_LIMIT}`;

/** A finished Session's start and its Counted sets. */
export type SessionSetCount = { started_at: string; sets: number };

export function parseSessionSetCounts(rows: readonly object[]): SessionSetCount[] {
  return z
    .array(z.object({ started_at: z.string(), sets: z.number() }))
    .parse(rows)
    .filter((row) => row.sets > 0);
}

/** Cursor pages use the same stable start/id ordering as the History list. */
export function sessionsPageSql(bounded = false): string {
  return SESSIONS_BETWEEN_SQL.replace(
    "s2.started_at >= ? AND s2.started_at < ?",
    `(s2.started_at < ? OR (s2.started_at = ? AND s2.id < ?))${
      bounded ? " AND s2.started_at >= ?" : ""
    }`,
  ).replace(`LIMIT ${SESSION_READ_LIMIT}`, "LIMIT ?");
}

/**
 * Read the History in bounded cursor pages: all of it, or only the Sessions that started in
 * `range`. Call inside one SQLite read transaction so a backdated insert or edit cannot move a
 * Session across a cursor between pages.
 */
export async function readFinishedHistoryPages(
  read: (sql: string, parameters: string[]) => Promise<readonly object[]>,
  range?: HistoryRange,
) {
  const pageSize = 200;
  const sessions: FinishedSession[] = [];
  const sql = sessionsPageSql(range !== undefined);
  let startedAt = range?.to ?? "9999-01-01T00:00:00.000Z";
  let id = "~";
  while (true) {
    const page = parseFinishedSessions(
      await read(sql, [startedAt, startedAt, id, ...(range ? [range.from] : []), String(pageSize)]),
    );
    sessions.push(...page);
    const last = page.at(-1);
    if (page.length < pageSize || !last) return sessions;
    startedAt = last.started_at;
    id = last.id;
  }
}

const BEFORE_SESSION = "AND (s.started_at < ? OR (s.started_at = ? AND s.id < ?))";

// Mix eight Unicode code points per SQLite recursion step. The small coefficients keep the
// arithmetic in signed 64-bit integers, even at the largest Unicode code point.
const HASH_COEFFICIENTS = [
  73856093, 19349663, 83492791, 297121507, 15485863, 32452843, 49979687, 86028121,
];
const HASH_CHUNK = HASH_COEFFICIENTS.map(
  (coefficient, index) => `COALESCE(unicode(substr(tail, ${index + 1}, 1)), 0) * ${coefficient}`,
).join(" + ");

/**
 * One fixed-size fingerprint per finished Session. Hash each display row in SQLite, then fold
 * the row hashes with their ordinal so a reorder or a same-total edit changes the digest.
 */
export function finishedFingerprintSql(bounded = false, exerciseCount = 0): string {
  const exerciseFilter = exerciseCount
    ? `AND se.exercise_id IN (${Array.from({ length: exerciseCount }, () => "?").join(", ")}) ${BEFORE_SESSION}`
    : "";
  return `WITH RECURSIVE
    display_rows AS (
      SELECT s.id,
        ROW_NUMBER() OVER (PARTITION BY s.id ORDER BY se.position, se.id, ss.position, ss.id) AS ordinal,
        json_array(se.exercise_id, se.exercise_type, se.exercise_title, ss.id, ss.kind,
          CASE WHEN ss.weight_kg IS NOT NULL THEN printf('%!.26g', ss.weight_kg) END,
          ss.reps, ss.duration_s,
          CASE WHEN ss.distance_m IS NOT NULL THEN printf('%!.26g', ss.distance_m) END,
          ss.floors, ss.steps,
          CASE WHEN ss.rpe IS NOT NULL THEN printf('%!.26g', ss.rpe) END, ss.completed_at) AS payload
      FROM training_session s
      LEFT JOIN session_exercise se ON se.session_id = s.id
      LEFT JOIN session_set ss ON ss.session_exercise_id = se.id AND ss.completed_at IS NOT NULL
      WHERE s.finished_at IS NOT NULL${bounded ? " AND s.started_at >= ? AND s.started_at < ?" : ""}
        ${exerciseFilter}
    ),
    hashes(id, ordinal, tail, hash) AS (
      SELECT id, ordinal, payload, 0 FROM display_rows
      UNION ALL
      SELECT id, ordinal, substr(tail, ${HASH_COEFFICIENTS.length + 1}),
        (hash * 262139 + ${HASH_CHUNK}) & 17592186044415
      FROM hashes WHERE tail <> ''
    ),
    digests AS (
      SELECT id, COUNT(*) AS rows, SUM(hash) AS content,
        SUM((hash * ordinal) & 17592186044415) AS display_order
      FROM hashes WHERE tail = '' GROUP BY id
    )
    SELECT s.id AS id, s.title AS title, s.started_at AS started_at,
      s.finished_at AS finished_at, s.duration_s AS duration_s, s.workout_id AS workout_id,
      d.rows, printf('%llx-%llx', d.content, d.display_order) AS digest
    FROM digests d JOIN training_session s ON s.id = d.id
    ORDER BY s.id`;
}

/** The finished Sessions with these ids (at most {@link IDS_PER_READ}), with their ticked sets. */
export function finishedByIdsSql(count: number): string {
  const ids = Array.from({ length: Math.max(1, count) }, () => "?").join(", ");
  return `SELECT ${SET_COLUMNS}
    FROM training_session s
    LEFT JOIN session_exercise se ON se.session_id = s.id
    LEFT JOIN session_set ss ON ss.session_exercise_id = se.id AND ss.completed_at IS NOT NULL
    WHERE s.finished_at IS NOT NULL AND s.id IN (${ids})
    ${SET_ORDER}`;
}

const IDS_PER_READ = 100;
const fingerprintRowSchema = z.object({ id: z.string() }).loose();

type Reader = (sql: string, parameters: string[]) => Promise<readonly object[]>;

/**
 * Keeps the finished Sessions of a range (or all of them) between reads. `refresh` reads the
 * fingerprints, then loads only the Sessions whose fingerprint changed (the first call pages in
 * everything), so a tick in an unfinished Session costs one aggregate query and no set parsing.
 * It returns the Sessions newest first, or `null` when nothing visible changed.
 */
export function createFinishedHistoryReader(range?: HistoryRange) {
  let fingerprints: Map<string, string> | null = null;
  const sessions = new Map<string, FinishedSession>();
  return {
    /** Forget what was read, so the next `refresh` loads everything again. */
    reset() {
      fingerprints = null;
      sessions.clear();
    },
    async refresh(read: Reader): Promise<FinishedSession[] | null> {
      const rows = await read(
        finishedFingerprintSql(range !== undefined),
        range ? [range.from, range.to] : [],
      );
      const next = new Map(
        z
          .array(fingerprintRowSchema)
          .parse(rows)
          .map((row) => [row.id, JSON.stringify(row)] as const),
      );
      if (fingerprints === null) {
        for (const session of await readFinishedHistoryPages(read, range)) {
          sessions.set(session.id, session);
        }
      } else {
        const previous = fingerprints;
        const changed = next
          .entries()
          .filter(([id, key]) => previous.get(id) !== key)
          .map(([id]) => id)
          .toArray();
        const removed = previous
          .keys()
          .filter((id) => !next.has(id))
          .toArray();
        if (changed.length === 0 && removed.length === 0) return null;
        for (const id of removed) sessions.delete(id);
        for (let at = 0; at < changed.length; at += IDS_PER_READ) {
          const ids = changed.slice(at, at + IDS_PER_READ);
          for (const session of parseFinishedSessions(
            await read(finishedByIdsSql(ids.length), ids),
          )) {
            sessions.set(session.id, session);
          }
        }
      }
      fingerprints = next;
      return [...sessions.values()].sort(
        (a, b) => b.started_at.localeCompare(a.started_at) || b.id.localeCompare(a.id),
      );
    },
  };
}

/**
 * Records must include the oldest best, and historical flags need chronological sets, not
 * just today's maxima. Scope to the displayed exercises but deliberately omit a session cap.
 * The ordinary Previous/chart read remains bounded.
 */
export function exerciseRecordsSql(bounded = false, beforeSession = false): string {
  return `SELECT ${SET_COLUMNS} FROM training_session s
    JOIN session_exercise se ON se.session_id = s.id
      AND se.exercise_id IN (SELECT value FROM json_each(?))
    JOIN session_set ss ON ss.session_exercise_id = se.id AND ss.completed_at IS NOT NULL
    WHERE s.finished_at IS NOT NULL${bounded ? " AND s.started_at < ?" : ""} ${beforeSession ? BEFORE_SESSION : ""} ${SET_ORDER}`;
}

const finishedRowSchema = z.object({
  exercise_title: z.string().nullable().optional(),
  session_id: z.string(),
  title: z.string(),
  started_at: z.string(),
  finished_at: z.string().nullable(),
  duration_s: z.number().nullable(),
  workout_id: z.string().nullable(),
  exercise_id: z.string().nullable(),
  exercise_type: z.enum(EXERCISE_TYPES).nullable(),
  set_id: z.string().nullable(),
  kind: kind.nullable(),
  weight_kg: z.number().nullable(),
  reps: z.number().nullable(),
  set_duration_s: z.number().nullable(),
  distance_m: z.number().nullable(),
  floors: z.number().nullable(),
  steps: z.number().nullable(),
  rpe: z.number().nullable(),
  completed_at: z.string().nullable(),
});

/** Groups the rows of {@link EXERCISE_HISTORY_SQL} or {@link SESSIONS_BETWEEN_SQL} by Session, in row order. */
export function parseFinishedSessions(rows: readonly object[]): FinishedSession[] {
  const result: FinishedSession[] = [];
  for (const row of z.array(finishedRowSchema).parse(rows)) {
    let current = result.at(-1);
    if (current?.id !== row.session_id) {
      current = {
        id: row.session_id,
        title: row.title,
        started_at: row.started_at,
        finished_at: row.finished_at,
        durationS: row.duration_s,
        workoutId: row.workout_id,
        sets: [],
      };
      result.push(current);
    }
    if (row.exercise_title) {
      current.exerciseTitles ??= [];
      if (
        current.exerciseTitles.length < 3 &&
        !current.exerciseTitles.includes(row.exercise_title)
      ) {
        current.exerciseTitles.push(row.exercise_title);
      }
    }
    if (
      row.set_id !== null &&
      row.exercise_id !== null &&
      row.exercise_type !== null &&
      row.kind !== null
    ) {
      const set: LoggedSet = {
        id: row.set_id,
        exercise_id: row.exercise_id,
        exercise_type: row.exercise_type,
        kind: row.kind,
        completed_at: row.completed_at,
        weight_kg: row.weight_kg,
        reps: row.reps,
        duration_s: row.set_duration_s,
        distance_m: row.distance_m,
        floors: row.floors,
        steps: row.steps,
        rpe: row.rpe,
      };
      current.sets.push(set);
    }
  }
  return result;
}

// ---- Gym equipment ----

export type EquipmentRow = {
  id: string;
  kind: "bar" | "plate";
  weightKg: number;
  unit: WeightUnit;
  label: string | null;
  count: number | null;
  enabled: boolean;
};

export const EQUIPMENT_SQL = `SELECT id, kind, weight_kg, unit, label, count, enabled FROM gym_equipment
  ORDER BY kind, weight_kg DESC, id LIMIT ${EQUIPMENT_LIMIT}`;

/** The bar an exercise remembers; one placeholder, the exercise id. */
export const EXERCISE_BAR_SQL = "SELECT bar_id FROM exercise_setting WHERE exercise_id = ?";

const exerciseBarSchema = z.array(z.object({ bar_id: z.string().nullable() }));

/** The remembered bar id from an `EXERCISE_BAR_SQL` result; null when none is remembered. */
export function parseExerciseBar(rows: readonly object[]): string | null {
  return exerciseBarSchema.parse(rows)[0]?.bar_id ?? null;
}

const equipmentRowSchema = z.object({
  id: z.string(),
  kind: z.enum(["bar", "plate"]),
  weight_kg: z.number(),
  unit: z.enum(["kg", "lb"]),
  label: z.string().nullable(),
  count: z.number().nullable(),
  enabled: flag,
});

export function parseEquipment(rows: readonly object[]): EquipmentRow[] {
  return z
    .array(equipmentRowSchema)
    .parse(rows)
    .map((row) => ({
      id: row.id,
      kind: row.kind,
      weightKg: row.weight_kg,
      unit: row.unit,
      label: row.label,
      count: row.count,
      enabled: row.enabled,
    }));
}
