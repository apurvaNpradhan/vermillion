import type { QueryResult } from "@powersync/common";
import {
  EQUIPMENT,
  EXERCISE_TYPES,
  MUSCLE_GROUPS,
  plannedSetSchema,
  type Equipment,
  type ExerciseType,
  type MuscleGroup,
  type PlannedSet,
} from "@workspace/shared";
import { z } from "zod";

import {
  ACTIVE_SESSIONS_SQL,
  EQUIPMENT_SQL,
  EXERCISE_BAR_SQL,
  parseExerciseBar,
  EXERCISE_HISTORY_SQL,
  exerciseHistoriesSql,
  exerciseRecordsSql,
  sessionsPageSql,
  parseExerciseHistories,
  SESSIONS_BETWEEN_SQL,
  SESSION_DETAIL_SQL,
  parseActiveSessions,
  parseEquipment,
  parseFinishedSessions,
  parseSessionDetail,
  type ActiveSession,
  type EquipmentRow,
  type FinishedSession,
  type SessionDetail,
} from "./session-watch";
import type { TrainingDatabase } from "./store";

const THROTTLE_MS = 150;

/** The exercise a Workout exercise points at; null when the library does not hold it (yet). */
export type WorkoutExerciseInfo = {
  title: string;
  primaryMuscle: MuscleGroup;
  secondaryMuscles: MuscleGroup[];
  equipment: Equipment;
  exerciseType: ExerciseType;
  thumbnailKey: string | null;
  isArchived: boolean;
};

export type WorkoutExerciseDetail = {
  id: string;
  workoutId: string;
  exerciseId: string;
  position: string;
  restSeconds: number | null;
  note: string | null;
  supersetGroup: string | null;
  sets: PlannedSet[];
  exercise: WorkoutExerciseInfo | null;
};

export type WorkoutDetail = {
  id: string;
  programId: string | null;
  title: string | null;
  note: string | null;
  exercises: WorkoutExerciseDetail[];
};

/** One standalone Workout in the Train list, with what its tile, name and estimate need. */
export type WorkoutSummary = {
  id: string;
  title: string | null;
  createdAt: string;
  exercises: {
    exerciseId: string;
    primaryMuscle: MuscleGroup | null;
    secondaryMuscles: MuscleGroup[];
    /** The library title, or null while the exercise has not arrived on this device. */
    title: string | null;
    thumbnailKey: string | null;
    sets: PlannedSet[];
    restSeconds: number | null;
  }[];
};

/** One Program in the Train list: the Rotation is only ids, which is all its summary needs. */
export type ProgramSummary = {
  id: string;
  title: string;
  plannedWeeks: number | null;
  createdAt: string;
  /** The cover photo on this device, or null (it never syncs). */
  coverUri: string | null;
  slots: { id: string; workoutId: string | null }[];
};

/** A Slot of a Program's Rotation with the Workout it holds (null = Rest). */
export type ProgramSlotDetail = {
  id: string;
  position: string;
  workoutId: string | null;
  workout: {
    title: string | null;
    exercises: WorkoutSummary["exercises"];
  } | null;
};

export type ProgramDetail = {
  id: string;
  title: string;
  description: string | null;
  plannedWeeks: number | null;
  coverUri: string | null;
  slots: ProgramSlotDetail[];
};

const jsonText = z.string().transform((text, context) => {
  try {
    return JSON.parse(text);
  } catch {
    context.addIssue({ code: "custom", message: "Not JSON" });
    return z.NEVER;
  }
});
const setsText = jsonText.pipe(z.array(plannedSetSchema));
const secondaryText = jsonText
  .pipe(z.array(z.enum(MUSCLE_GROUPS)))
  .nullable()
  .optional()
  .transform((value) => value ?? []);

const listRowSchema = z.object({
  id: z.string(),
  title: z.string().nullable(),
  created_at: z.string(),
  sets: setsText.nullable(),
  rest_seconds: z.number().nullable(),
  primary_muscle: z.enum(MUSCLE_GROUPS).nullable(),
  secondary_muscles: secondaryText,
  exercise_title: z.string().nullable(),
  thumbnail_key: z.string().nullable(),
  exercise_row: z.string().nullable(),
  exercise_id: z.string().nullable(),
});

const workoutListSql = (
  includeProgramWorkouts: boolean,
) => `SELECT w.id AS id, w.title AS title, w.created_at AS created_at,
    we.id AS exercise_row, we.exercise_id AS exercise_id, we.sets AS sets, we.rest_seconds AS rest_seconds,
    e.primary_muscle AS primary_muscle, e.secondary_muscles AS secondary_muscles, e.title AS exercise_title, e.thumbnail_key AS thumbnail_key
  FROM workout w
  LEFT JOIN workout_exercise we ON we.workout_id = w.id
  LEFT JOIN exercise e ON e.id = we.exercise_id
  ${includeProgramWorkouts ? "" : "WHERE w.program_id IS NULL"}
  ORDER BY w.created_at DESC, w.id DESC, we.position, we.id`;
export const WORKOUT_LIST_SQL = workoutListSql(false);

/** Groups the joined rows of {@link WORKOUT_LIST_SQL} into Workouts, in row order. */
export function parseWorkoutList(rows: readonly object[]): WorkoutSummary[] {
  const parsed = z.array(listRowSchema).parse(rows);
  const result: WorkoutSummary[] = [];
  for (const row of parsed) {
    let current = result.at(-1);
    if (current?.id !== row.id) {
      current = { id: row.id, title: row.title, createdAt: row.created_at, exercises: [] };
      result.push(current);
    }
    if (row.exercise_row !== null && row.exercise_id !== null) {
      current.exercises.push({
        exerciseId: row.exercise_id,
        primaryMuscle: row.primary_muscle,
        secondaryMuscles: row.secondary_muscles,
        title: row.exercise_title,
        thumbnailKey: row.thumbnail_key,
        sets: row.sets ?? [],
        restSeconds: row.rest_seconds,
      });
    }
  }
  return result;
}

const detailRowSchema = z.object({
  id: z.string(),
  program_id: z.string().nullable(),
  title: z.string().nullable(),
  note: z.string().nullable(),
  exercise_row: z.string().nullable(),
  exercise_id: z.string().nullable(),
  position: z.string().nullable(),
  rest_seconds: z.number().nullable(),
  exercise_note: z.string().nullable(),
  superset_group: z.string().nullable(),
  sets: setsText.nullable(),
  exercise_title: z.string().nullable(),
  primary_muscle: z.enum(MUSCLE_GROUPS).nullable(),
  secondary_muscles: secondaryText,
  equipment: z.enum(EQUIPMENT).nullable(),
  exercise_type: z.enum(EXERCISE_TYPES).nullable(),
  thumbnail_key: z.string().nullable(),
  retired_at: z.string().nullable(),
});

export const WORKOUT_DETAIL_SQL = `SELECT w.id AS id, w.program_id AS program_id, w.title AS title,
    w.note AS note, we.id AS exercise_row, we.exercise_id AS exercise_id, we.position AS position,
    we.rest_seconds AS rest_seconds, we.note AS exercise_note,
    we.superset_group AS superset_group, we.sets AS sets, e.title AS exercise_title,
    e.primary_muscle AS primary_muscle, e.secondary_muscles AS secondary_muscles, e.equipment AS equipment,
    e.exercise_type AS exercise_type, e.thumbnail_key AS thumbnail_key, e.retired_at AS retired_at
  FROM workout w
  LEFT JOIN workout_exercise we ON we.workout_id = w.id
  LEFT JOIN exercise e ON e.id = we.exercise_id
  WHERE w.id = ?
  ORDER BY we.position, we.id`;

/** Builds one Workout from the joined rows of {@link WORKOUT_DETAIL_SQL}; null if none. */
export function parseWorkoutDetail(rows: readonly object[]): WorkoutDetail | null {
  const parsed = z.array(detailRowSchema).parse(rows);
  const first = parsed[0];
  if (first === undefined) return null;
  const exercises: WorkoutExerciseDetail[] = [];
  for (const row of parsed) {
    if (row.exercise_row === null || row.exercise_id === null || row.position === null) continue;
    exercises.push({
      id: row.exercise_row,
      workoutId: row.id,
      exerciseId: row.exercise_id,
      position: row.position,
      restSeconds: row.rest_seconds,
      note: row.exercise_note,
      supersetGroup: row.superset_group,
      sets: row.sets ?? [],
      exercise:
        row.exercise_title !== null &&
        row.primary_muscle !== null &&
        row.equipment !== null &&
        row.exercise_type !== null
          ? {
              title: row.exercise_title,
              primaryMuscle: row.primary_muscle,
              secondaryMuscles: row.secondary_muscles,
              equipment: row.equipment,
              exerciseType: row.exercise_type,
              thumbnailKey: row.thumbnail_key,
              isArchived: row.retired_at !== null,
            }
          : null,
    });
  }
  return {
    id: first.id,
    programId: first.program_id,
    title: first.title,
    note: first.note,
    exercises,
  };
}

const WORKOUT_TABLES = ["workout", "workout_exercise", "exercise"];
const PROGRAM_TABLES = ["program", "program_cover", "program_slot", ...WORKOUT_TABLES];

const programListRowSchema = z.object({
  id: z.string(),
  title: z.string(),
  planned_weeks: z.number().nullable(),
  created_at: z.string(),
  cover_uri: z.string().nullable(),
  slot_id: z.string().nullable(),
  workout_id: z.string().nullable(),
});

export const PROGRAM_LIST_SQL = `SELECT p.id AS id, p.title AS title, p.planned_weeks AS planned_weeks,
    p.created_at AS created_at, pc.uri AS cover_uri,
    s.id AS slot_id, s.workout_id AS workout_id
  FROM program p
  LEFT JOIN program_cover pc ON pc.id = p.id
  LEFT JOIN program_slot s ON s.program_id = p.id
  ORDER BY p.created_at DESC, p.id DESC, s.position, s.id`;

/** Groups the joined rows of {@link PROGRAM_LIST_SQL} into Programs, newest first. */
export function parseProgramList(rows: readonly object[]): ProgramSummary[] {
  const result: ProgramSummary[] = [];
  for (const row of z.array(programListRowSchema).parse(rows)) {
    let current = result.at(-1);
    if (current?.id !== row.id) {
      current = {
        id: row.id,
        title: row.title,
        plannedWeeks: row.planned_weeks,
        createdAt: row.created_at,
        coverUri: row.cover_uri,
        slots: [],
      };
      result.push(current);
    }
    if (row.slot_id !== null) current.slots.push({ id: row.slot_id, workoutId: row.workout_id });
  }
  return result;
}

const programDetailRowSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  planned_weeks: z.number().nullable(),
  cover_uri: z.string().nullable(),
  slot_id: z.string().nullable(),
  slot_position: z.string().nullable(),
  slot_workout_id: z.string().nullable(),
  workout_row: z.string().nullable(),
  workout_title: z.string().nullable(),
  exercise_row: z.string().nullable(),
  exercise_id: z.string().nullable(),
  sets: setsText.nullable(),
  rest_seconds: z.number().nullable(),
  primary_muscle: z.enum(MUSCLE_GROUPS).nullable(),
  secondary_muscles: secondaryText,
  exercise_title: z.string().nullable(),
  thumbnail_key: z.string().nullable(),
});

export const PROGRAM_DETAIL_SQL = `SELECT p.id AS id, p.title AS title, p.description AS description,
    p.planned_weeks AS planned_weeks, pc.uri AS cover_uri, s.id AS slot_id, s.position AS slot_position,
    s.workout_id AS slot_workout_id, w.id AS workout_row, w.title AS workout_title,
    we.id AS exercise_row, we.exercise_id AS exercise_id, we.sets AS sets,
    we.rest_seconds AS rest_seconds, e.primary_muscle AS primary_muscle, e.secondary_muscles AS secondary_muscles,
    e.title AS exercise_title, e.thumbnail_key AS thumbnail_key
  FROM program p
  LEFT JOIN program_cover pc ON pc.id = p.id
  LEFT JOIN program_slot s ON s.program_id = p.id
  LEFT JOIN workout w ON w.id = s.workout_id
  LEFT JOIN workout_exercise we ON we.workout_id = w.id
  LEFT JOIN exercise e ON e.id = we.exercise_id
  WHERE p.id = ?
  ORDER BY s.position, s.id, we.position, we.id`;

/**
 * Builds one Program with its Rotation from the joined rows of {@link PROGRAM_DETAIL_SQL}; null
 * if none. A Slot whose Workout has not arrived on this device yet is left out until it does.
 */
export function parseProgramDetail(rows: readonly object[]): ProgramDetail | null {
  const parsed = z.array(programDetailRowSchema).parse(rows);
  const first = parsed[0];
  if (first === undefined) return null;
  const slots: ProgramSlotDetail[] = [];
  for (const row of parsed) {
    if (row.slot_id === null || row.slot_position === null) continue;
    let current = slots.at(-1);
    if (current?.id !== row.slot_id) {
      if (row.slot_workout_id !== null && row.workout_row === null) continue;
      current = {
        id: row.slot_id,
        position: row.slot_position,
        workoutId: row.slot_workout_id,
        workout: row.slot_workout_id === null ? null : { title: row.workout_title, exercises: [] },
      };
      slots.push(current);
    }
    if (
      current.id === row.slot_id &&
      current.workout &&
      row.exercise_row !== null &&
      row.exercise_id !== null
    ) {
      current.workout.exercises.push({
        exerciseId: row.exercise_id,
        primaryMuscle: row.primary_muscle,
        secondaryMuscles: row.secondary_muscles,
        title: row.exercise_title,
        thumbnailKey: row.thumbnail_key,
        sets: row.sets ?? [],
        restSeconds: row.rest_seconds,
      });
    }
  }
  return {
    id: first.id,
    title: first.title,
    description: first.description,
    plannedWeeks: first.planned_weeks,
    coverUri: first.cover_uri,
    slots,
  };
}

function watch(
  database: TrainingDatabase,
  sql: string,
  params: string[],
  tables: string[],
  onRows: (rows: QueryResult["array"]) => void,
  onError: (error: Error) => void,
): () => void {
  const controller = new AbortController();
  // A write to any watched table re-runs the query. Most of those leave this result as it was
  // (a tick in the active Session never changes an exercise's finished history), and passing
  // an equal result on re-renders every screen that reads it, so only a changed result is passed.
  let last: string | null = null;
  database.watchWithCallback(
    sql,
    params,
    {
      onResult: (result) => {
        if (controller.signal.aborted) return;
        const key = JSON.stringify(result.array);
        if (key === last) return;
        last = key;
        onRows(result.array);
      },
      onError: (error) => {
        if (!controller.signal.aborted) onError(error);
      },
    },
    {
      signal: controller.signal,
      tables,
      throttleMs: THROTTLE_MS,
    },
  );
  return () => controller.abort();
}

function parsing<T>(
  parse: (rows: QueryResult["array"]) => T,
  handlers: { onResult: (value: T) => void; onError: (error: Error) => void },
) {
  return (rows: QueryResult["array"]) => {
    let value: T;
    try {
      value = parse(rows);
    } catch {
      handlers.onError(new Error("The local workouts could not be read"));
      return;
    }
    handlers.onResult(value);
  };
}

/** Watches the standalone Workouts, newest first. */
export function watchWorkouts(
  database: TrainingDatabase,
  handlers: { onWorkouts: (workouts: WorkoutSummary[]) => void; onError: (error: Error) => void },
  options: { includeProgramWorkouts?: boolean } = {},
): () => void {
  return watch(
    database,
    workoutListSql(options.includeProgramWorkouts ?? false),
    [],
    WORKOUT_TABLES,
    parsing(parseWorkoutList, { onResult: handlers.onWorkouts, onError: handlers.onError }),
    handlers.onError,
  );
}

/** Watches one Workout with its exercises in order; `null` when it is gone. */
export function watchWorkout(
  database: TrainingDatabase,
  id: string,
  handlers: { onWorkout: (workout: WorkoutDetail | null) => void; onError: (error: Error) => void },
): () => void {
  return watch(
    database,
    WORKOUT_DETAIL_SQL,
    [id],
    WORKOUT_TABLES,
    parsing(parseWorkoutDetail, { onResult: handlers.onWorkout, onError: handlers.onError }),
    handlers.onError,
  );
}

/** Watches the Programs, newest first. */
export function watchPrograms(
  database: TrainingDatabase,
  handlers: { onPrograms: (programs: ProgramSummary[]) => void; onError: (error: Error) => void },
): () => void {
  return watch(
    database,
    PROGRAM_LIST_SQL,
    [],
    PROGRAM_TABLES,
    parsing(parseProgramList, { onResult: handlers.onPrograms, onError: handlers.onError }),
    handlers.onError,
  );
}

/** Watches one Program with its Rotation in order; `null` when it is gone. */
export function watchProgram(
  database: TrainingDatabase,
  id: string,
  handlers: { onProgram: (program: ProgramDetail | null) => void; onError: (error: Error) => void },
): () => void {
  return watch(
    database,
    PROGRAM_DETAIL_SQL,
    [id],
    PROGRAM_TABLES,
    parsing(parseProgramDetail, { onResult: handlers.onProgram, onError: handlers.onError }),
    handlers.onError,
  );
}

/** The type of one library exercise, or null if the library does not hold it. */
export async function readExerciseType(
  database: TrainingDatabase,
  exerciseId: string,
): Promise<ExerciseType | null> {
  const row = await database.getOptional<{ exercise_type: string }>(
    "SELECT exercise_type FROM exercise WHERE id = ?",
    [exerciseId],
  );
  const parsed = z.enum(EXERCISE_TYPES).safeParse(row?.exercise_type);
  return parsed.success ? parsed.data : null;
}

/** One Workout read once, with its exercises, for sharing; null if it is gone. */
export async function readWorkoutDetail(
  database: TrainingDatabase,
  id: string,
): Promise<WorkoutDetail | null> {
  return parseWorkoutDetail(await database.getAll(WORKOUT_DETAIL_SQL, [id]));
}

/** A Program with its Rotation and the full detail of every Workout in it, read once. */
export type ProgramPlan = {
  title: string;
  description: string | null;
  /** In Rotation order; `workout` is null for a Rest Slot. */
  slots: { workout: WorkoutDetail | null }[];
};

const programRowSchema = z.object({
  title: z.string(),
  description: z.string().nullable(),
});
const slotRowSchema = z.object({ workout_id: z.string().nullable() });

/** The Program's plan for sharing as text; null if it is gone. */
export async function readProgramPlan(
  database: TrainingDatabase,
  id: string,
): Promise<ProgramPlan | null> {
  const found = await database.getOptional<object>(
    "SELECT title, description FROM program WHERE id = ?",
    [id],
  );
  if (!found) return null;
  const head = programRowSchema.parse(found);
  const slotRows = z
    .array(slotRowSchema)
    .parse(
      await database.getAll(
        "SELECT workout_id FROM program_slot WHERE program_id = ? ORDER BY position, id",
        [id],
      ),
    );
  const details = new Map<string, WorkoutDetail | null>();
  for (const { workout_id } of slotRows) {
    if (workout_id !== null && !details.has(workout_id)) {
      details.set(workout_id, await readWorkoutDetail(database, workout_id));
    }
  }
  const slots: ProgramPlan["slots"] = [];
  for (const { workout_id } of slotRows) {
    if (workout_id === null) {
      slots.push({ workout: null });
      continue;
    }
    const workout = details.get(workout_id);
    if (workout) slots.push({ workout });
  }
  return { title: head.title, description: head.description, slots };
}

// ---- Sessions (ADR 0038) ----

const SESSION_TABLES = ["training_session", "session_exercise", "session_set"];

/** Watches the unfinished Sessions, newest first. There may be more than one (two started offline). */
export function watchActiveSessions(
  database: TrainingDatabase,
  handlers: {
    onSessions: (sessions: ActiveSession[]) => void;
    onError: (error: Error) => void;
  },
): () => void {
  return watch(
    database,
    ACTIVE_SESSIONS_SQL,
    [],
    SESSION_TABLES,
    parsing(parseActiveSessions, { onResult: handlers.onSessions, onError: handlers.onError }),
    handlers.onError,
  );
}

/** Watches one Session with its exercises and sets in order; `null` when it is gone. */
export function watchSession(
  database: TrainingDatabase,
  id: string,
  handlers: { onSession: (session: SessionDetail | null) => void; onError: (error: Error) => void },
): () => void {
  return watch(
    database,
    SESSION_DETAIL_SQL,
    [id],
    [...SESSION_TABLES, "exercise"],
    parsing(parseSessionDetail, { onResult: handlers.onSession, onError: handlers.onError }),
    handlers.onError,
  );
}

/**
 * Watches the finished Sessions that contain an exercise, newest first, each with that exercise's
 * ticked sets (counted and warm-up): what Previous, Records and the exercise's charts read.
 */
export function watchExerciseHistory(
  database: TrainingDatabase,
  exerciseId: string,
  handlers: {
    onHistory: (sessions: FinishedSession[]) => void;
    onError: (error: Error) => void;
  },
): () => void {
  return watch(
    database,
    EXERCISE_HISTORY_SQL,
    [exerciseId, exerciseId],
    SESSION_TABLES,
    parsing(parseFinishedSessions, { onResult: handlers.onHistory, onError: handlers.onError }),
    handlers.onError,
  );
}

/**
 * {@link watchExerciseHistory} for several exercises at once, in one query: each id maps to its
 * finished Sessions, and an id with none maps to an empty list.
 */
export function watchExerciseHistories(
  database: TrainingDatabase,
  exerciseIds: readonly string[],
  handlers: {
    onHistories: (histories: Map<string, FinishedSession[]>) => void;
    onError: (error: Error) => void;
  },
): () => void {
  const ids = [...new Set(exerciseIds)];
  if (ids.length === 0) {
    handlers.onHistories(new Map());
    return () => undefined;
  }
  const withEmpty = (rows: readonly object[]) => {
    const found = parseExerciseHistories(rows);
    return new Map(ids.map((id) => [id, found.get(id) ?? []]));
  };
  return watch(
    database,
    exerciseHistoriesSql(ids.length),
    [...ids, ...ids],
    SESSION_TABLES,
    parsing(withEmpty, { onResult: handlers.onHistories, onError: handlers.onError }),
    handlers.onError,
  );
}

/** Watches the finished Sessions that started in `[from, to)` (ISO times), newest first. */
export function watchSessionsBetween(
  database: TrainingDatabase,
  range: { from: string; to: string; workoutId?: string },
  handlers: {
    onSessions: (sessions: FinishedSession[]) => void;
    onError: (error: Error) => void;
  },
): () => void {
  return watch(
    database,
    range.workoutId
      ? SESSIONS_BETWEEN_SQL.replace(
          "s2.finished_at IS NOT NULL",
          "s2.finished_at IS NOT NULL AND s2.workout_id = ?",
        )
      : SESSIONS_BETWEEN_SQL,
    range.workoutId ? [range.workoutId, range.from, range.to] : [range.from, range.to],
    SESSION_TABLES,
    parsing(parseFinishedSessions, { onResult: handlers.onSessions, onError: handlers.onError }),
    handlers.onError,
  );
}

/** Watches the user's bars and plates: bars first, heavier first. */
export function watchEquipment(
  database: TrainingDatabase,
  handlers: { onEquipment: (items: EquipmentRow[]) => void; onError: (error: Error) => void },
): () => void {
  return watch(
    database,
    EQUIPMENT_SQL,
    [],
    ["gym_equipment"],
    parsing(parseEquipment, { onResult: handlers.onEquipment, onError: handlers.onError }),
    handlers.onError,
  );
}

/** Watches the bar an exercise remembers (null when none); the exercise id is the one parameter. */
export function watchExerciseBar(
  database: TrainingDatabase,
  exerciseId: string,
  handlers: { onBar: (barId: string | null) => void; onError: (error: Error) => void },
): () => void {
  return watch(
    database,
    EXERCISE_BAR_SQL,
    [exerciseId],
    ["exercise_setting"],
    parsing(parseExerciseBar, { onResult: handlers.onBar, onError: handlers.onError }),
    handlers.onError,
  );
}

/** Watches a cursor page, including one extra Session so the caller can detect the next page. */
export function watchSessionPage(
  database: TrainingDatabase,
  cursor: { startedAt: string; id: string },
  limit: number,
  handlers: { onSessions: (sessions: FinishedSession[]) => void; onError: (error: Error) => void },
) {
  return watch(
    database,
    sessionsPageSql(),
    [cursor.startedAt, cursor.startedAt, cursor.id, String(Math.min(500, Math.max(1, limit)))],
    SESSION_TABLES,
    parsing(parseFinishedSessions, { onResult: handlers.onSessions, onError: handlers.onError }),
    handlers.onError,
  );
}

/** Complete exercise-scoped chronological history for Record comparisons. */
export function watchRecordHistory(
  database: TrainingDatabase,
  ids: readonly string[],
  handlers: { onSessions: (sessions: FinishedSession[]) => void; onError: (error: Error) => void },
) {
  if (!ids.length) {
    handlers.onSessions([]);
    return () => undefined;
  }
  return watch(
    database,
    exerciseRecordsSql(ids.length),
    [...ids],
    SESSION_TABLES,
    parsing(parseFinishedSessions, { onResult: handlers.onSessions, onError: handlers.onError }),
    handlers.onError,
  );
}

/** Local rows exclude deleted Workouts and exercises through the sync stream. */
export const LATEST_EXERCISE_PLAN_SQL = `SELECT we.sets FROM workout_exercise we JOIN workout w ON w.id = we.workout_id
     WHERE we.exercise_id = ? ORDER BY w.created_at DESC, w.id DESC, we.position, we.id LIMIT 1`;

/** Most recently created surviving Workout that plans this exercise. */
export function watchLatestExercisePlan(
  database: TrainingDatabase,
  exerciseId: string,
  handlers: { onPlan: (sets: PlannedSet[] | null) => void; onError: (error: Error) => void },
): () => void {
  const parse = (rows: QueryResult["array"]) => {
    const row = z.array(z.object({ sets: z.string() })).parse(rows)[0];
    return row ? z.array(plannedSetSchema).parse(JSON.parse(row.sets)) : null;
  };
  return watch(
    database,
    LATEST_EXERCISE_PLAN_SQL,
    [exerciseId],
    WORKOUT_TABLES,
    parsing(parse, { onResult: handlers.onPlan, onError: handlers.onError }),
    handlers.onError,
  );
}
