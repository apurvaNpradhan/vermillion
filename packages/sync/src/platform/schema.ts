import { getTableName } from "drizzle-orm";
import { DrizzleAppSchema } from "@powersync/drizzle-driver";

import { bodyMeasurement, progressPhoto } from "../body/tables";
import { exercise, exercisePin } from "../exercise/tables";
import { attachments, media } from "../media/tables";
import { userPreferences } from "../preferences/tables";
import {
  exerciseSetting,
  gymEquipment,
  historyImportReceipt,
  program,
  programRun,
  programSlot,
  programSlotSkip,
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
  exercisePin,
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
  userPreferences,
  attachments,
  programRun,
  programSlotSkip,
  deviceOwner,
  installMeta,
  rejectedWrites,
  historyImportReceipt,
};

/**
 * The PowerSync schema, derived from the Drizzle tables so the two cannot drift. Local-only tables
 * are never synced or uploaded. Index declarations on the Drizzle tables carry over.
 */
export const powerSyncSchema = new DrizzleAppSchema({
  body_measurement: { tableDefinition: bodyMeasurement },
  progress_photo: { tableDefinition: progressPhoto },
  exercise: { tableDefinition: exercise },
  exercise_pin: { tableDefinition: exercisePin },
  program: { tableDefinition: program },
  program_run: { tableDefinition: programRun },
  program_slot_skip: { tableDefinition: programSlotSkip },
  workout: { tableDefinition: workout },
  workout_exercise: { tableDefinition: workoutExercise },
  program_slot: { tableDefinition: programSlot },
  training_session: {
    tableDefinition: session,
    options: {
      trackPrevious: { columns: ["paused_at", "paused_ms", "finished_at"], onlyWhenChanged: false },
    },
  },
  session_exercise: { tableDefinition: sessionExercise },
  session_photo: { tableDefinition: sessionPhoto },
  session_set: {
    tableDefinition: sessionSet,
    // A DELETE reports the completion the device knew, for the server's conflict check.
    options: {
      trackPrevious: { columns: ["completed_at", "timer_started_at"], onlyWhenChanged: false },
    },
  },
  gym_equipment: { tableDefinition: gymEquipment },
  exercise_setting: { tableDefinition: exerciseSetting },
  media: { tableDefinition: media },
  user_preferences: { tableDefinition: userPreferences },
  attachments: { tableDefinition: attachments, options: { localOnly: true } },
  deviceOwner: { tableDefinition: deviceOwner, options: { localOnly: true } },
  installMeta: { tableDefinition: installMeta, options: { localOnly: true } },
  historyImportReceipt: { tableDefinition: historyImportReceipt, options: { localOnly: true } },
  rejectedWrites: { tableDefinition: rejectedWrites, options: { localOnly: true } },
});

/** Names of the tables that sync with the server (not the local-only ones). */
export const SYNCED_TABLE_NAMES: readonly string[] = [
  getTableName(exercise),
  getTableName(exercisePin),
  getTableName(bodyMeasurement),
  getTableName(progressPhoto),
  getTableName(program),
  getTableName(programRun),
  getTableName(programSlotSkip),
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
  getTableName(userPreferences),
];
