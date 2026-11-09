import { createdAt, id, updatedAt } from "@workspace/db/columns";
import { user } from "@workspace/db/schema/auth";
import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { BODY_MAX, TITLE_MAX } from "./limits";

/** Minimal deletion identity survives payload/receipt retention; removed with the account. */
export const deletedNoteIds = pgTable(
  "deleted_note_ids",
  {
    id: uuid("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("deleted_note_ids_user_id_idx").on(table.userId)],
);

/**
 * A user's note. Rows go with the user (cascade), so account deletion needs no purger.
 * Synced table (ADR 0019): `deleted_at` is a tombstone, purged after the retention period.
 */
export const notes = pgTable(
  "notes",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    index("notes_user_id_updated_at_idx").on(table.userId, table.updatedAt),
    index("notes_user_id_live_idx")
      .on(table.userId)
      .where(sql`${table.deletedAt} IS NULL`),
    // Mirror the zod caps so a direct write cannot bypass them. char_length counts code points,
    // JS length counts UTF-16 units, so the zod cap is never looser than these.
    check(
      "notes_title_length",
      sql`char_length(${table.title}) BETWEEN 1 AND ${sql.raw(String(TITLE_MAX))}`,
    ),
    check("notes_body_length", sql`char_length(${table.body}) <= ${sql.raw(String(BODY_MAX))}`),
  ],
);
