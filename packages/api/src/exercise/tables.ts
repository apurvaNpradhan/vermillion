import { createdAt, id, updatedAt } from "@workspace/db/columns";
import { user } from "@workspace/db/schema/auth";
import {
  EQUIPMENT,
  EXERCISE_INSTRUCTIONS_MAX,
  EXERCISE_TITLE_MAX,
  EXERCISE_TYPES,
  MUSCLE_GROUPS,
} from "@workspace/shared";
import { sql, type SQL } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/** `'a', 'b'` for a CHECK; the values are our own constants, never user input. */
const literals = (values: readonly string[]) =>
  sql.raw(values.map((value) => `'${value}'`).join(", "));

const oneOf = (column: SQL | { name: string }, values: readonly string[]): SQL =>
  sql`${column} IN (${literals(values)})`;

/**
 * The exercise library (ADR 0034). `user_id IS NULL` is a catalog row (Reference data, imported
 * from the committed file); an owned row is a Custom exercise. Rows are retired (`retired_at`),
 * never deleted, so a logged set always resolves. Slugs are text with CHECKs, never enums:
 * a new slug is an additive migration. Synced: `exercise_catalog` and `my_library` streams.
 */
export const exercise = pgTable(
  "exercise",
  {
    id: id(),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    primaryMuscle: text("primary_muscle").notNull(),
    secondaryMuscles: text("secondary_muscles")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    equipment: text("equipment").notNull(),
    exerciseType: text("exercise_type").notNull(),
    isFullBodyweight: boolean("is_full_bodyweight").notNull().default(false),
    rank: smallint("rank").notNull().default(0),
    searchTerms: text("search_terms"),
    aka: text("aka"),
    instructions: text("instructions"),
    videoKey: text("video_key"),
    thumbnailKey: text("thumbnail_key"),
    retiredAt: timestamp("retired_at", { withTimezone: true, mode: "date" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("exercise_user_id_idx")
      .on(table.userId)
      .where(sql`${table.userId} IS NOT NULL`),
    uniqueIndex("exercise_catalog_title_uidx")
      .on(table.title)
      .where(sql`${table.userId} IS NULL`),
    check("exercise_primary_muscle_known", oneOf(table.primaryMuscle, MUSCLE_GROUPS)),
    check(
      "exercise_secondary_muscles_known",
      sql`${table.secondaryMuscles} <@ ARRAY[${literals(MUSCLE_GROUPS)}]::text[]`,
    ),
    check("exercise_equipment_known", oneOf(table.equipment, EQUIPMENT)),
    check("exercise_type_known", oneOf(table.exerciseType, EXERCISE_TYPES)),
    // Mirror the zod caps so a direct write cannot bypass them.
    check(
      "exercise_title_length",
      sql`char_length(${table.title}) BETWEEN 1 AND ${sql.raw(String(EXERCISE_TITLE_MAX))}`,
    ),
    check(
      "exercise_instructions_length",
      sql`char_length(${table.instructions}) <= ${sql.raw(String(EXERCISE_INSTRUCTIONS_MAX))}`,
    ),
  ],
);

/**
 * Server-only: the fingerprint of the last imported Reference data file per catalog, so an
 * unchanged file costs one read at startup. Not published; devices never see it.
 */
export const referenceImport = pgTable("reference_import", {
  catalog: text("catalog").primaryKey(),
  fingerprint: text("fingerprint").notNull(),
  importedAt: timestamp("imported_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});
