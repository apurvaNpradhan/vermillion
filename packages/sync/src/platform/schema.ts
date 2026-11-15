import { getTableName } from "drizzle-orm";
import { DrizzleAppSchema } from "@powersync/drizzle-driver";

import { bodyMeasurement, progressPhoto } from "../body/tables";
import { exercise } from "../exercise/tables";
import { attachments, media } from "../media/tables";
import {
  exerciseSetting,
  gymEquipment,
  program,
  programRun,
  programSlot,
  session,
  sessionExercise,
  sessionSet,
  sessionPhoto,
  workout,
  workoutExercise,
} from "../training/tables";
import { deviceOwner, installMeta, rejectedWrites } from "./tables";

/** Drizzle tables for typed local queries. */
export const drizzleSchema = {
  bodyMeasurement,
  progressPhoto,
  exercise,
  program,
  workout,
  workoutExercise,
  programSlot,
  session,
  sessionExercise,
  sessionSet,
  sessionPhoto,
  gymEquipment,
  exerciseSetting,
  media,
  attachments,
  programRun,
  deviceOwner,
  installMeta,
  rejectedWrites,
};

/**
 * The PowerSync schema, derived from the Drizzle tables so the two cannot drift. Local-only tables
 * are never synced or uploaded. Index declarations on the Drizzle tables carry over.
 */
export const powerSyncSchema = new DrizzleAppSchema({
  body_measurement: { tableDefinition: bodyMeasurement },
  progress_photo: { tableDefinition: progressPhoto },
  exercise: { tableDefinition: exercise },
  program: { tableDefinition: program },
  program_run: { tableDefinition: programRun },
  workout: { tableDefinition: workout },
  workout_exercise: { tableDefinition: workoutExercise },
  program_slot: { tableDefinition: programSlot },
  training_session: { tableDefinition: session },
  session_exercise: { tableDefinition: sessionExercise },
  session_photo: { tableDefinition: sessionPhoto },
  session_set: { tableDefinition: sessionSet },
  gym_equipment: { tableDefinition: gymEquipment },
  exercise_setting: { tableDefinition: exerciseSetting },
  media: { tableDefinition: media },
  attachments: { tableDefinition: attachments, options: { localOnly: true } },
  deviceOwner: { tableDefinition: deviceOwner, options: { localOnly: true } },
  installMeta: { tableDefinition: installMeta, options: { localOnly: true } },
  rejectedWrites: { tableDefinition: rejectedWrites, options: { localOnly: true } },
});

/** Names of the tables that sync with the server (not the local-only ones). */
export const SYNCED_TABLE_NAMES: readonly string[] = [
  getTableName(exercise),
  getTableName(bodyMeasurement),
  getTableName(progressPhoto),
  getTableName(program),
  getTableName(programRun),
  getTableName(workout),
  getTableName(workoutExercise),
  getTableName(programSlot),
  getTableName(session),
  getTableName(sessionExercise),
  getTableName(sessionSet),
  getTableName(sessionPhoto),
  getTableName(gymEquipment),
  getTableName(exerciseSetting),
  getTableName(media),
];
