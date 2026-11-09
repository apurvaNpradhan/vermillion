// Legacy: the `notes` example vertical was removed (ADR 0035), but its tables stay in Postgres
// because migrations are additive-only (ADR 0007). Nothing reads or writes them. These minimal
// definitions exist only so `pnpm db:generate` sees the tables and does not emit a DROP. They are
// excluded from the app code on purpose: no router, handler or stream uses them.
import { createdAt, id, updatedAt } from "@workspace/db/columns";
import { user } from "@workspace/db/schema/auth";
import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

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
    check("notes_title_length", sql`char_length(${table.title}) BETWEEN 1 AND 200`),
    check("notes_body_length", sql`char_length(${table.body}) <= 10000`),
  ],
);
