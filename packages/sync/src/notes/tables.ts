import { index, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Client mirror of `notes` in `packages/api/src/notes/tables.ts` (the parity test keeps them
 * honest). PowerSync stores `id` implicitly; timestamps arrive from the sync service as ISO text.
 */
export const notes = sqliteTable(
  "notes",
  {
    id: text("id").primaryKey().notNull(),
    user_id: text("user_id").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull(),
    deleted_at: text("deleted_at"),
  },
  (table) => [
    // PowerSync keeps rows as JSON, so an unindexed ORDER BY parses every row. The list orders by
    // updated_at with an id tie-breaker and hides tombstones: the index serves exactly that.
    index("notes_live_updated_at_idx").on(table.deleted_at, table.updated_at, table.id),
  ],
);
