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

import type { TrainingDatabase } from "./store";

const THROTTLE_MS = 150;

/** The exercise a Workout exercise points at; null when the library does not hold it (yet). */
export type WorkoutExerciseInfo = {
  title: string;
  primaryMuscle: MuscleGroup;
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
  slots: ProgramSlotDetail[];
};

const setsText = z
  .string()
  .transform((text, context) => {
    try {
      return JSON.parse(text);
    } catch {
      context.addIssue({ code: "custom", message: "Not JSON" });
      return z.NEVER;
    }
  })
  .pipe(z.array(plannedSetSchema));

const listRowSchema = z.object({
  id: z.string(),
  title: z.string().nullable(),
  created_at: z.string(),
  sets: setsText.nullable(),
  rest_seconds: z.number().nullable(),
  primary_muscle: z.enum(MUSCLE_GROUPS).nullable(),
  exercise_row: z.string().nullable(),
  exercise_id: z.string().nullable(),
});

export const WORKOUT_LIST_SQL = `SELECT w.id AS id, w.title AS title, w.created_at AS created_at,
    we.id AS exercise_row, we.exercise_id AS exercise_id, we.sets AS sets, we.rest_seconds AS rest_seconds,
    e.primary_muscle AS primary_muscle
  FROM workout w
  LEFT JOIN workout_exercise we ON we.workout_id = w.id
  LEFT JOIN exercise e ON e.id = we.exercise_id
  WHERE w.program_id IS NULL
  ORDER BY w.created_at DESC, w.id DESC, we.position, we.id`;

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
  equipment: z.enum(EQUIPMENT).nullable(),
  exercise_type: z.enum(EXERCISE_TYPES).nullable(),
  thumbnail_key: z.string().nullable(),
  retired_at: z.string().nullable(),
});

export const WORKOUT_DETAIL_SQL = `SELECT w.id AS id, w.program_id AS program_id, w.title AS title,
    w.note AS note, we.id AS exercise_row, we.exercise_id AS exercise_id, we.position AS position,
    we.rest_seconds AS rest_seconds, we.note AS exercise_note,
    we.superset_group AS superset_group, we.sets AS sets, e.title AS exercise_title,
    e.primary_muscle AS primary_muscle, e.equipment AS equipment,
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
const PROGRAM_TABLES = ["program", "program_slot", ...WORKOUT_TABLES];

const programListRowSchema = z.object({
  id: z.string(),
  title: z.string(),
  planned_weeks: z.number().nullable(),
  created_at: z.string(),
  slot_id: z.string().nullable(),
  workout_id: z.string().nullable(),
});

export const PROGRAM_LIST_SQL = `SELECT p.id AS id, p.title AS title, p.planned_weeks AS planned_weeks,
    p.created_at AS created_at, s.id AS slot_id, s.workout_id AS workout_id
  FROM program p
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
});

export const PROGRAM_DETAIL_SQL = `SELECT p.id AS id, p.title AS title, p.description AS description,
    p.planned_weeks AS planned_weeks, s.id AS slot_id, s.position AS slot_position,
    s.workout_id AS slot_workout_id, w.id AS workout_row, w.title AS workout_title,
    we.id AS exercise_row, we.exercise_id AS exercise_id, we.sets AS sets,
    we.rest_seconds AS rest_seconds, e.primary_muscle AS primary_muscle
  FROM program p
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
  database.watchWithCallback(
    sql,
    params,
    {
      onResult: (result) => {
        if (!controller.signal.aborted) onRows(result.array);
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
): () => void {
  return watch(
    database,
    WORKOUT_LIST_SQL,
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
