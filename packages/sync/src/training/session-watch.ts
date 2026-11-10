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
};

export type SessionExerciseDetail = {
  id: string;
  exerciseId: string;
  /** Snapshots: history reads without the library. */
  title: string;
  type: ExerciseType;
  sourceWorkoutExerciseId: string | null;
  position: string;
  restSeconds: number | null;
  note: string | null;
  supersetGroup: string | null;
  logEffort: boolean;
  /** The library's current data (muscles, media); null while it has not arrived on this device. */
  exercise: {
    primaryMuscle: MuscleGroup;
    secondaryMuscles: MuscleGroup[];
    equipment: Equipment;
    thumbnailKey: string | null;
  } | null;
  sets: SessionSetDetail[];
};

export type SessionDetail = {
  id: string;
  workoutId: string | null;
  programId: string | null;
  runId: string | null;
  slotId: string | null;
  cycle: number | null;
  title: string;
  titleDerived: boolean;
  note: string | null;
  startedAt: string;
  finishedAt: string | null;
  /** The user's override of the clock duration. */
  durationS: number | null;
  deviceId: string;
  rest: { setId: string; startedAt: string; endsAt: string } | null;
  exercises: SessionExerciseDetail[];
};

export const SESSION_DETAIL_SQL = `SELECT s.id AS id, s.workout_id AS workout_id, s.program_id AS program_id,
    s.run_id AS run_id, s.slot_id AS slot_id, s.cycle AS cycle, s.title AS title,
    s.title_derived AS title_derived, s.note AS note, s.started_at AS started_at,
    s.finished_at AS finished_at, s.duration_s AS duration_s, s.device_id AS device_id,
    s.rest_set_id AS rest_set_id, s.rest_started_at AS rest_started_at, s.rest_ends_at AS rest_ends_at,
    se.id AS exercise_row, se.exercise_id AS exercise_id, se.exercise_title AS exercise_title,
    se.exercise_type AS exercise_type, se.source_workout_exercise_id AS source_workout_exercise_id,
    se.position AS exercise_position, se.rest_seconds AS rest_seconds, se.note AS exercise_note,
    se.superset_group AS superset_group, se.log_effort AS log_effort,
    e.primary_muscle AS primary_muscle, e.secondary_muscles AS secondary_muscles,
    e.equipment AS equipment, e.thumbnail_key AS thumbnail_key,
    ss.id AS set_row, ss.position AS set_position, ss.kind AS kind, ss.weight_kg AS weight_kg,
    ss.reps AS reps, ss.duration_s AS set_duration_s, ss.distance_m AS distance_m,
    ss.floors AS floors, ss.steps AS steps, ss.rpe AS rpe, ss.completed_at AS completed_at,
    ss.timer_started_at AS timer_started_at, ss.target AS target
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
  program_id: z.string().nullable(),
  run_id: z.string().nullable(),
  slot_id: z.string().nullable(),
  cycle: z.number().nullable(),
  title: z.string(),
  title_derived: flag,
  note: z.string().nullable(),
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
  exercise_position: z.string().nullable(),
  rest_seconds: z.number().nullable(),
  exercise_note: z.string().nullable(),
  superset_group: z.string().nullable(),
  log_effort: flag.nullable(),
  primary_muscle: z.enum(MUSCLE_GROUPS).nullable(),
  secondary_muscles: secondaryText,
  equipment: z.enum(EQUIPMENT).nullable(),
  thumbnail_key: z.string().nullable(),
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
});

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
        position: row.exercise_position,
        restSeconds: row.rest_seconds,
        note: row.exercise_note,
        supersetGroup: row.superset_group,
        logEffort: row.log_effort ?? false,
        exercise:
          row.primary_muscle !== null && row.equipment !== null
            ? {
                primaryMuscle: row.primary_muscle,
                secondaryMuscles: row.secondary_muscles,
                equipment: row.equipment,
                thumbnailKey: row.thumbnail_key,
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
      });
    }
  }
  return {
    id: first.id,
    workoutId: first.workout_id,
    programId: first.program_id,
    runId: first.run_id,
    slotId: first.slot_id,
    cycle: first.cycle,
    title: first.title,
    titleDerived: first.title_derived,
    note: first.note,
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
};

const SET_COLUMNS = `s.id AS session_id, s.title AS title, s.started_at AS started_at,
    s.finished_at AS finished_at, s.duration_s AS duration_s, s.workout_id AS workout_id,
    se.exercise_id AS exercise_id, se.exercise_type AS exercise_type,
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

/** Cursor pages use the same stable start/id ordering as the History list. */
export function sessionsPageSql(): string {
  return SESSIONS_BETWEEN_SQL.replace(
    "s2.started_at >= ? AND s2.started_at < ?",
    "(s2.started_at < ? OR (s2.started_at = ? AND s2.id < ?))",
  ).replace(`LIMIT ${SESSION_READ_LIMIT}`, "LIMIT ?");
}

/**
 * Records must include the oldest best, and historical flags need chronological sets, not
 * just today's maxima. Scope to the displayed exercises but deliberately omit a session cap.
 * The ordinary Previous/chart read remains bounded.
 */
export function exerciseRecordsSql(count: number): string {
  const ids = Array.from({ length: Math.max(1, count) }, () => "?").join(", ");
  return `SELECT ${SET_COLUMNS} FROM training_session s
    JOIN session_exercise se ON se.session_id = s.id AND se.exercise_id IN (${ids})
    JOIN session_set ss ON ss.session_exercise_id = se.id AND ss.completed_at IS NOT NULL
    WHERE s.finished_at IS NOT NULL ${SET_ORDER}`;
}

const finishedRowSchema = z.object({
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
