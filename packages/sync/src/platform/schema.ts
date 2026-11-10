import { getTableName } from "drizzle-orm";
import { DrizzleAppSchema } from "@powersync/drizzle-driver";

import { exercise } from "../exercise/tables";
import { program, programCover, programSlot, workout, workoutExercise } from "../training/tables";
import { deviceOwner, installMeta, rejectedWrites } from "./tables";

/** Drizzle tables for typed local queries. */
export const drizzleSchema = {
  exercise,
  program,
  workout,
  workoutExercise,
  programSlot,
  programCover,
  deviceOwner,
  installMeta,
  rejectedWrites,
};

/**
 * The PowerSync schema, derived from the Drizzle tables so the two cannot drift. Local-only tables
 * are never synced or uploaded. Index declarations on the Drizzle tables carry over.
 */
export const powerSyncSchema = new DrizzleAppSchema({
  exercise: { tableDefinition: exercise },
  program: { tableDefinition: program },
  workout: { tableDefinition: workout },
  workout_exercise: { tableDefinition: workoutExercise },
  program_slot: { tableDefinition: programSlot },
  program_cover: { tableDefinition: programCover, options: { localOnly: true } },
  deviceOwner: { tableDefinition: deviceOwner, options: { localOnly: true } },
  installMeta: { tableDefinition: installMeta, options: { localOnly: true } },
  rejectedWrites: { tableDefinition: rejectedWrites, options: { localOnly: true } },
});

/** Names of the tables that sync with the server (not the local-only ones). */
export const SYNCED_TABLE_NAMES: readonly string[] = [
  getTableName(exercise),
  getTableName(program),
  getTableName(workout),
  getTableName(workoutExercise),
  getTableName(programSlot),
];
