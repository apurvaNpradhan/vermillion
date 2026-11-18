import type { Locale } from "@workspace/shared";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Client mirror of `user_preferences` (ADR 0049): the one row of the signed-in user, fed by the
 * `my_preferences` stream. `ui` holds only what the user changed, as JSON text, like the server.
 */
export const userPreferences = sqliteTable("user_preferences", {
  id: text("id").primaryKey().notNull(),
  user_id: text("user_id").notNull(),
  locale: text("locale").$type<Locale>(),
  timezone: text("timezone"),
  ui: text("ui").notNull().default("{}"),
  created_at: text("created_at").notNull(),
});
