import { z } from "zod";

import { plannedSetSchema } from "./planned-sets";
import { POSITION_KEY_MAX, REST_SECONDS_MAX, TRAINING_LIMITS } from "./vocabulary";

const title = z.string().trim().min(TRAINING_LIMITS.titleMin).max(TRAINING_LIMITS.titleMax);
const note = z.string().max(TRAINING_LIMITS.noteMax).nullable();

/** A fractional-indexing key: base 62 digits. */
export const positionKey = z
  .string()
  .max(POSITION_KEY_MAX)
  .regex(/^[0-9A-Za-z]+$/);

/** The writable fields of each plan row. Native forms and the upload handler share them. */
export const programInput = z.strictObject({
  title,
  description: z.string().max(TRAINING_LIMITS.descriptionMax).nullable(),
  planned_weeks: z
    .number()
    .int()
    .min(TRAINING_LIMITS.plannedWeeksMin)
    .max(TRAINING_LIMITS.plannedWeeksMax)
    .nullable(),
});
export type ProgramInput = z.infer<typeof programInput>;

/** `title` null means the title is derived from the exercises. A Workout never changes Program. */
export const workoutInput = z.strictObject({
  program_id: z.uuid().nullable(),
  title: title.nullable(),
  note,
});
export type WorkoutInput = z.infer<typeof workoutInput>;

/** `sets` here only has the shape; the exercise's type decides which fields it may hold. */
export const workoutExerciseInput = z.strictObject({
  workout_id: z.uuid(),
  exercise_id: z.uuid(),
  position: positionKey,
  rest_seconds: z.number().int().min(0).max(REST_SECONDS_MAX).nullable(),
  note,
  superset_group: z.uuid().nullable(),
  sets: z.array(plannedSetSchema).max(TRAINING_LIMITS.setsPerExercise),
});
export type WorkoutExerciseInput = z.infer<typeof workoutExerciseInput>;

/** `workout_id` null is a Rest slot. */
export const programSlotInput = z.strictObject({
  program_id: z.uuid(),
  workout_id: z.uuid().nullable(),
  position: positionKey,
});
export type ProgramSlotInput = z.infer<typeof programSlotInput>;
