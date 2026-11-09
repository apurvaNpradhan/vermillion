import type { Equipment, ExerciseType, MuscleGroup } from "@workspace/shared";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Client mirror of `exercise` in `packages/api/src/exercise/tables.ts`. Two streams feed it: the
 * catalog (`user_id` null) and the owner's Custom exercises. PowerSync hands Postgres arrays over
 * as JSON text and booleans as 0/1; the column modes decode them. `updated_at` stays on the server.
 */
export const exercise = sqliteTable(
  "exercise",
  {
    id: text("id").primaryKey().notNull(),
    user_id: text("user_id"),
    title: text("title").notNull(),
    primary_muscle: text("primary_muscle").$type<MuscleGroup>().notNull(),
    secondary_muscles: text("secondary_muscles", { mode: "json" })
      .$type<MuscleGroup[]>()
      .notNull()
      .default([]),
    equipment: text("equipment").$type<Equipment>().notNull(),
    exercise_type: text("exercise_type").$type<ExerciseType>().notNull(),
    is_full_bodyweight: integer("is_full_bodyweight", { mode: "boolean" }).notNull().default(false),
    rank: integer("rank").notNull().default(0),
    search_terms: text("search_terms"),
    aka: text("aka"),
    instructions: text("instructions"),
    video_key: text("video_key"),
    thumbnail_key: text("thumbnail_key"),
    retired_at: text("retired_at"),
    created_at: text("created_at").notNull(),
  },
  (table) => [
    // PowerSync keeps rows as JSON, so an unindexed ORDER BY or filter parses every row.
    index("exercise_title_idx").on(table.title),
    index("exercise_primary_muscle_idx").on(table.primary_muscle),
    index("exercise_equipment_idx").on(table.equipment),
    index("exercise_retired_at_idx").on(table.retired_at),
  ],
);
