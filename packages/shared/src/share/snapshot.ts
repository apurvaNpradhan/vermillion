import { z } from "zod";

import {
  EQUIPMENT,
  EXERCISE_TITLE_MAX,
  EXERCISE_TYPES,
  MUSCLE_GROUPS,
} from "../exercise/vocabulary";
import { plannedSetSchema, plannedSetsSchema } from "../training/plans/planned-sets";
import { REST_SECONDS_MAX, TRAINING_LIMITS } from "../training/vocabulary/vocabulary";
import type { ShareLinkKind } from "./codes";

/**
 * Share snapshots (ADR 0058): a Program or a Workout as a self-contained, versioned JSON document.
 * It carries no user id, no row id and no media, only what a stranger needs to rebuild the plan,
 * so the same document serves a Share link, the web preview and, later, a starter-program library.
 * A change that an older reader could misread gets a new format name (`…/v2`), never a quiet edit.
 */
export const SHARE_FORMATS = {
  program: "sigil.program/v1",
  workout: "sigil.workout/v1",
} as const satisfies Record<ShareLinkKind, string>;

/** The largest snapshot the API stores, in bytes of JSON. Real plans are a few KB. */
export const SHARE_SNAPSHOT_MAX_BYTES = 512 * 1024;

const { titleMax, descriptionMax } = TRAINING_LIMITS;

/**
 * An exercise by reference. `catalog_id` names a catalog exercise (the reader maps it to its own
 * copy of the catalog); the rest describes it fully, so a reader that lacks the id, and every
 * Custom exercise (`catalog_id` null), can create it. The web preview shows these names, since a
 * browser has no catalog. Notes are private: a snapshot never carries a Workout's or an exercise's
 * note, and the strict schemas refuse one.
 */
export const shareExerciseSchema = z.strictObject({
  catalog_id: z.uuid().nullable(),
  name: z.string().trim().min(1).max(EXERCISE_TITLE_MAX),
  equipment: z.enum(EQUIPMENT),
  exercise_type: z.enum(EXERCISE_TYPES),
  primary_muscle: z.enum(MUSCLE_GROUPS),
  secondary_muscles: z.array(z.enum(MUSCLE_GROUPS)).max(MUSCLE_GROUPS.length),
});
export type ShareExercise = z.infer<typeof shareExerciseSchema>;

const shareWorkoutExerciseSchema = z
  .strictObject({
    exercise: shareExerciseSchema,
    rest_seconds: z.number().int().min(0).max(REST_SECONDS_MAX).nullable(),
    /** Exercises with the same number are one Superset; null is none. Numbers are local to the Workout. */
    superset: z.number().int().min(0).max(TRAINING_LIMITS.exercisesPerWorkout).nullable(),
    sets: z.array(plannedSetSchema).max(TRAINING_LIMITS.setsPerExercise),
  })
  .superRefine((entry, ctx) => {
    // The sets may only use the fields the exercise's type records.
    const check = plannedSetsSchema(entry.exercise.exercise_type).safeParse(entry.sets);
    if (!check.success) {
      for (const issue of check.error.issues) {
        ctx.addIssue({ code: "custom", path: ["sets", ...issue.path], error: issue.message });
      }
    }
  });

/** One Workout's content, in order. */
export const shareWorkoutSchema = z.strictObject({
  title: z.string().trim().min(1).max(titleMax).nullable(),
  exercises: z.array(shareWorkoutExerciseSchema).max(TRAINING_LIMITS.exercisesPerWorkout),
});
export type ShareWorkout = z.infer<typeof shareWorkoutSchema>;

export const workoutSnapshotSchema = z.strictObject({
  format: z.literal(SHARE_FORMATS.workout),
  workout: shareWorkoutSchema,
});
export type WorkoutSnapshot = z.infer<typeof workoutSnapshotSchema>;

const shareProgramSchema = z
  .strictObject({
    title: z.string().trim().min(1).max(titleMax),
    description: z.string().max(descriptionMax).nullable(),
    planned_weeks: z
      .number()
      .int()
      .min(TRAINING_LIMITS.plannedWeeksMin)
      .max(TRAINING_LIMITS.plannedWeeksMax)
      .nullable(),
    sessions_per_week: z
      .number()
      .int()
      .min(TRAINING_LIMITS.sessionsPerWeekMin)
      .max(TRAINING_LIMITS.sessionsPerWeekMax)
      .nullable(),
    workouts: z.array(shareWorkoutSchema).max(TRAINING_LIMITS.slotsPerProgram),
    /** The Rotation: an index into `workouts` per Slot, null for Rest. A Workout may repeat. */
    rotation: z.array(z.number().int().min(0).nullable()).max(TRAINING_LIMITS.slotsPerProgram),
  })
  .superRefine((program, ctx) => {
    for (const [at, index] of program.rotation.entries()) {
      if (index !== null && index >= program.workouts.length) {
        ctx.addIssue({ code: "custom", path: ["rotation", at], error: "No such workout" });
      }
    }
  });
export type ShareProgram = z.infer<typeof shareProgramSchema>;

export const programSnapshotSchema = z.strictObject({
  format: z.literal(SHARE_FORMATS.program),
  program: shareProgramSchema,
});
export type ProgramSnapshot = z.infer<typeof programSnapshotSchema>;

/** Any snapshot a reader understands; `format` says which. */
export const shareSnapshotSchema = z.discriminatedUnion("format", [
  programSnapshotSchema,
  workoutSnapshotSchema,
]);
export type ShareSnapshot = z.infer<typeof shareSnapshotSchema>;

/** What a snapshot is: the kind its format names. */
export function snapshotKind(snapshot: ShareSnapshot): ShareLinkKind {
  return snapshot.format === SHARE_FORMATS.program ? "program" : "workout";
}

/** The name to show for a snapshot: its Program title, or its Workout title when it has one. */
export function snapshotTitle(snapshot: ShareSnapshot): string | null {
  return snapshot.format === SHARE_FORMATS.program
    ? snapshot.program.title
    : snapshot.workout.title;
}
