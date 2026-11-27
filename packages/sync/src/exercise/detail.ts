import type { QueryResult } from "@powersync/common";
import {
  ALWAYS_AVAILABLE_EQUIPMENT,
  EQUIPMENT,
  EXERCISE_TYPES,
  MUSCLE_GROUPS,
  detailLikePattern,
  type Equipment,
  type MuscleDetail,
} from "@workspace/shared";
import { z } from "zod";

import { parseMuscleDetails } from "./details";
import type { LibraryRow } from "./library";
import { IS_PINNED_SQL, LIBRARY_ROW_COLUMNS, type LibraryQuery } from "./library-query";
import type { ExerciseDatabase } from "./store";

/** The most swap candidates the detail screen shows. */
export const SWAP_CANDIDATE_LIMIT = 8;

const THROTTLE_MS = 150;

const muscleGroupSchema = z.enum(MUSCLE_GROUPS);
const equipmentSchema = z.enum(EQUIPMENT);

const DETAIL_COLUMNS =
  "id, user_id, title, primary_muscle, secondary_muscles, primary_detail, secondary_detail, equipment, exercise_type, is_full_bodyweight, aka, instructions, video_key, thumbnail_key, image_media_id, retired_at";

const detailRowSchema = z.object({
  id: z.string(),
  user_id: z.string().nullable(),
  title: z.string(),
  primary_muscle: muscleGroupSchema,
  secondary_muscles: z.string().nullable(),
  primary_detail: z.string().nullable(),
  secondary_detail: z.string().nullable(),
  equipment: equipmentSchema,
  exercise_type: z.enum(EXERCISE_TYPES),
  is_full_bodyweight: z.number(),
  aka: z.string().nullable(),
  instructions: z.string().nullable(),
  video_key: z.string().nullable(),
  image_media_id: z.string().nullable().optional(),
  thumbnail_key: z.string().nullable(),
  retired_at: z.string().nullable(),
  is_pinned: z.number(),
});

/** PowerSync hands a Postgres array over as JSON text. */
const secondaryMusclesSchema = z
  .string()
  .nullable()
  .transform((text, context) => {
    try {
      return text === null ? [] : JSON.parse(text);
    } catch {
      context.addIssue({ code: "custom", message: "Not JSON" });
      return z.NEVER;
    }
  })
  .pipe(z.array(muscleGroupSchema));

/** One exercise as the detail screen shows it; retired rows resolve too. */
export type ExerciseDetail = {
  id: string;
  title: string;
  aka: string | null;
  instructions: string | null;
  primaryMuscle: z.infer<typeof muscleGroupSchema>;
  secondaryMuscles: z.infer<typeof muscleGroupSchema>[];
  primaryDetail: MuscleDetail[];
  secondaryDetail: MuscleDetail[];
  equipment: z.infer<typeof equipmentSchema>;
  exerciseType: (typeof EXERCISE_TYPES)[number];
  isFullBodyweight: boolean;
  videoKey: string | null;
  imageMediaId?: string | null;
  thumbnailKey: string | null;
  isCustom: boolean;
  isArchived: boolean;
  isPinned: boolean;
};

/** The lookup of one exercise by id, retired or not. */
export function exerciseDetailQuery(id: string): LibraryQuery {
  return {
    sql: `SELECT ${DETAIL_COLUMNS}, ${IS_PINNED_SQL} AS is_pinned FROM exercise WHERE id = ? LIMIT 1`,
    params: [id],
  };
}

/**
 * The exercise types that can stand in for each other in a swap: a weighted lift is not offered a
 * timed or a plain bodyweight alternative. A type outside these groups swaps only with its own.
 */
const COMPATIBLE_TYPES = [
  ["weight_reps", "bodyweight_weighted_reps"],
  ["bodyweight_reps", "reps_only", "bodyweight_assisted_reps"],
] as const satisfies readonly (readonly (typeof EXERCISE_TYPES)[number][])[];

/** The types a swap for `type` may be, itself included. */
export function compatibleSwapTypes(type: (typeof EXERCISE_TYPES)[number]): string[] {
  return [...(COMPATIBLE_TYPES.find((group) => group.some((member) => member === type)) ?? [type])];
}

/**
 * Live exercises with the same primary muscle and a compatible type, equipment of any kind (a
 * cable fly is a fine swap for a machine fly). Exercises whose equipment the gym has come first
 * (`unavailable` lists what it lacks; bodyweight is always there), then most shared primary
 * details (ADR 0050), then best rank, then title, then id; at most `limit`, applied after that
 * ordering, so a lacking-equipment exercise only fills what the rest leaves. The exercise itself
 * is never listed. Without details the order is rank.
 */
export function swapCandidatesQuery(
  exercise: {
    id: string;
    primaryMuscle: string;
    exerciseType?: (typeof EXERCISE_TYPES)[number];
    primaryDetail?: readonly MuscleDetail[];
    /** Equipment types the gym does not have. */
    unavailable?: readonly Equipment[];
  },
  limit: number = SWAP_CANDIDATE_LIMIT,
): LibraryQuery {
  const details = exercise.primaryDetail ?? [];
  const overlap = details.map(() => `(primary_detail LIKE ? ESCAPE '\\')`);
  const shared = overlap.length > 0 ? `(${overlap.join(" + ")}) DESC, ` : "";
  const types = exercise.exerciseType ? compatibleSwapTypes(exercise.exerciseType) : [];
  const typeFilter =
    types.length > 0 ? ` AND exercise_type IN (${types.map(() => "?").join(", ")})` : "";
  const lacking = (exercise.unavailable ?? []).filter(
    (equipment) => !ALWAYS_AVAILABLE_EQUIPMENT.includes(equipment),
  );
  const here =
    lacking.length > 0 ? `(equipment IN (${lacking.map(() => "?").join(", ")})) ASC, ` : "";
  return {
    sql: `SELECT ${LIBRARY_ROW_COLUMNS}, ${IS_PINNED_SQL} AS is_pinned FROM exercise
      WHERE retired_at IS NULL AND primary_muscle = ? AND id <> ?${typeFilter}
      ORDER BY ${here}${shared}rank DESC, title COLLATE NOCASE, id LIMIT ?`,
    params: [
      exercise.primaryMuscle,
      exercise.id,
      ...types,
      ...lacking,
      ...details.map(detailLikePattern),
      limit,
    ],
  };
}

const candidateRowSchema = z.object({
  id: z.string(),
  user_id: z.string().nullable(),
  title: z.string(),
  primary_muscle: muscleGroupSchema,
  primary_detail: z.string().nullable().optional(),
  secondary_detail: z.string().nullable().optional(),
  equipment: equipmentSchema,
  image_media_id: z.string().nullable().optional(),
  thumbnail_key: z.string().nullable(),
  retired_at: z.string().nullable(),
  is_pinned: z.number(),
});

/** Watches one exercise; `null` when no row has that id (yet). */
export function watchExercise(
  database: ExerciseDatabase,
  id: string,
  handlers: {
    onExercise: (exercise: ExerciseDetail | null) => void;
    onError: (error: Error) => void;
  },
): () => void {
  return watch(
    database,
    exerciseDetailQuery(id),
    (rows) => {
      const first = rows[0];
      if (first === undefined) {
        handlers.onExercise(null);
        return;
      }
      const parsed = detailRowSchema.safeParse(first);
      const secondary = parsed.success
        ? secondaryMusclesSchema.safeParse(parsed.data.secondary_muscles)
        : null;
      if (!parsed.success || !secondary?.success) {
        handlers.onError(new Error("The local exercise could not be read"));
        return;
      }
      const row = parsed.data;
      handlers.onExercise({
        id: row.id,
        title: row.title,
        aka: row.aka,
        instructions: row.instructions,
        primaryMuscle: row.primary_muscle,
        secondaryMuscles: secondary.data,
        primaryDetail: parseMuscleDetails(row.primary_detail),
        secondaryDetail: parseMuscleDetails(row.secondary_detail),
        equipment: row.equipment,
        exerciseType: row.exercise_type,
        isFullBodyweight: row.is_full_bodyweight !== 0,
        videoKey: row.video_key,
        thumbnailKey: row.thumbnail_key,
        imageMediaId: row.image_media_id ?? null,
        isCustom: row.user_id !== null,
        isArchived: row.retired_at !== null,
        isPinned: row.is_pinned === 1,
      });
    },
    handlers.onError,
  );
}

/** Watches the swap candidates of `exercise`. */
export function watchSwapCandidates(
  database: ExerciseDatabase,
  exercise: {
    id: string;
    primaryMuscle: string;
    exerciseType?: (typeof EXERCISE_TYPES)[number];
    primaryDetail?: readonly MuscleDetail[];
    unavailable?: readonly Equipment[];
  },
  handlers: { onRows: (rows: LibraryRow[]) => void; onError: (error: Error) => void },
): () => void {
  return watch(
    database,
    swapCandidatesQuery(exercise),
    (rows) => {
      const parsed = z.array(candidateRowSchema).safeParse(rows);
      if (!parsed.success) {
        handlers.onError(new Error("Local exercises could not be read"));
        return;
      }
      handlers.onRows(
        parsed.data.map((row) => ({
          id: row.id,
          title: row.title,
          primaryMuscle: row.primary_muscle,
          primaryDetail: parseMuscleDetails(row.primary_detail),
          secondaryDetail: parseMuscleDetails(row.secondary_detail),
          equipment: row.equipment,
          thumbnailKey: row.thumbnail_key,
          imageMediaId: row.image_media_id ?? null,
          isCustom: row.user_id !== null,
          isArchived: row.retired_at !== null,
          isPinned: row.is_pinned === 1,
        })),
      );
    },
    handlers.onError,
  );
}

function watch(
  database: ExerciseDatabase,
  query: LibraryQuery,
  onRows: (rows: QueryResult["array"]) => void,
  onError: (error: Error) => void,
): () => void {
  const controller = new AbortController();
  database.watchWithCallback(
    query.sql,
    query.params,
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
      tables: ["exercise", "exercise_pin"],
      throttleMs: THROTTLE_MS,
    },
  );
  return () => controller.abort();
}
