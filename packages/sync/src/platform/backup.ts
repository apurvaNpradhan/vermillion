import type { AbstractPowerSyncDatabase } from "@powersync/common";
import { getTableName } from "drizzle-orm";
import { z } from "zod";

import { drizzleSchema } from "./schema";
import { storageRowToWire, type WireRow } from "./row-conversion";

/** Include only owner data. Local bookkeeping and the catalog stay out of the file. */
export const BACKUP_TABLES = [
  [
    drizzleSchema.exercise,
    "id, user_id, title, primary_muscle, secondary_muscles, primary_detail, secondary_detail, equipment, exercise_type, is_full_bodyweight, rank, search_terms, aka, instructions, video_key, thumbnail_key, image_media_id, retired_at, created_at",
  ],
  [
    drizzleSchema.bodyMeasurement,
    "id, user_id, metric, value, measured_at, local_date, source, created_at",
  ],
  [drizzleSchema.progressPhoto, "id, user_id, media_id, pose, taken_at, local_date, created_at"],
  [
    drizzleSchema.program,
    "id, user_id, title, description, planned_weeks, sessions_per_week, cover_media_id, phase_plan, created_at",
  ],
  [
    drizzleSchema.programRun,
    "id, user_id, program_id, activated_at, started_at, finished_at, outcome, continued_at, inserted_deloads, pauses, created_at",
  ],
  [
    drizzleSchema.workout,
    "id, user_id, program_id, title, note, cover_media_id, main_entry_id, created_at",
  ],
  [
    drizzleSchema.workoutExercise,
    "id, user_id, workout_id, exercise_id, position, rest_seconds, note, superset_group, sets, created_at",
  ],
  [drizzleSchema.programSlot, "id, user_id, program_id, workout_id, position, created_at"],
  [
    drizzleSchema.session,
    "id, user_id, workout_id, program_id, run_id, slot_id, cycle, title, title_derived, note, started_at, finished_at, duration_s, device_id, rest_set_id, rest_started_at, rest_ends_at, created_at, workout_structure, import_batch_id, import_fingerprint, import_content, paused_at, paused_ms, gym_id, phase, phase_modifiers",
  ],
  [
    drizzleSchema.sessionExercise,
    "id, user_id, session_id, exercise_id, exercise_title, exercise_type, source_workout_exercise_id, workout_swap_fragment, position, rest_seconds, note, superset_group, log_effort, warmup_key, repeated, stall_deload, prescription, created_at",
  ],
  [drizzleSchema.sessionPhoto, "id, user_id, session_id, media_id, position, created_at"],
  [
    drizzleSchema.sessionSet,
    "id, user_id, session_exercise_id, position, kind, weight_kg, reps, duration_s, distance_m, floors, steps, rpe, completed_at, timer_started_at, target, generated_warmup, created_at",
  ],
  [drizzleSchema.programSlotSkip, "id, user_id, run_id, slot_id, cycle, created_at"],
  [drizzleSchema.exercisePin, "id, user_id, exercise_id, created_at"],
  [drizzleSchema.gym, "id, user_id, name, unavailable_equipment, dumbbell_max_kg, created_at"],
  [
    drizzleSchema.gymEquipment,
    "id, user_id, kind, weight_kg, unit, label, count, enabled, gym_id, created_at",
  ],
  [
    drizzleSchema.gymExerciseSetting,
    "id, user_id, gym_id, exercise_id, load_ranges, setup_note, created_at",
  ],
  [
    drizzleSchema.exerciseSetting,
    "id, user_id, exercise_id, bar_id, unit, log_effort, progression_per_set, auto_warmups, progression_rule, note, created_at",
  ],
  [drizzleSchema.media, "id, user_id, kind, mime, width, height, bytes, thumb_bytes, created_at"],
  [drizzleSchema.userPreferences, "id, user_id, locale, timezone, ui, created_at"],
] as const; // Safety: each tuple pairs a table with its fixed SQL column list.

const PAGE_SIZE = 1000;
const pageSchema = z.array(z.record(z.string(), z.union([z.string(), z.number(), z.null()])));

export type BackupPageWriter = (table: string, rows: readonly WireRow[]) => Promise<void>;

/** Visits bounded pages from one SQLite snapshot, including the empty tables. */
export function visitBackupPages(
  database: Pick<AbstractPowerSyncDatabase, "readTransaction">,
  owner: string,
  writePage: BackupPageWriter,
): Promise<void> {
  return database.readTransaction(async (tx) => {
    for (const [table, columns] of BACKUP_TABLES) {
      const name = getTableName(table);
      for (let offset = 0; ; offset += PAGE_SIZE) {
        const page = pageSchema.parse(
          await tx.getAll(
            `SELECT ${columns} FROM "${name}" WHERE user_id = ? ORDER BY id LIMIT ? OFFSET ?`,
            [owner, PAGE_SIZE, offset],
          ),
        );
        if (offset === 0 || page.length > 0) {
          await writePage(
            name,
            page.map((row) => storageRowToWire(table, row)),
          );
        }
        if (page.length < PAGE_SIZE) break;
      }
    }
  });
}
