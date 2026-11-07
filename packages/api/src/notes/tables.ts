import { createdAt, id, updatedAt } from "@workspace/db/columns";
import { user } from "@workspace/db/schema/auth";
import { index, pgTable, text } from "drizzle-orm/pg-core";

/** A user's note. Rows go with the user (cascade), so account deletion needs no purger. */
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
  },
  (table) => [index("notes_user_id_updated_at_idx").on(table.userId, table.updatedAt)],
);
