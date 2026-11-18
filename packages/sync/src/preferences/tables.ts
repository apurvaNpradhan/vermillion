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
  /**
   * Local only: the keys the latest write changed, as JSON (`PreferencesPatch`). It is the only
   * column an upload carries, so the server applies what the user changed, never the merged view,
   * and an explicit `null` survives the first insert, where PowerSync drops NULL columns. The
   * stream does not list it, so a sync overwrites it with nothing once the upload is through.
   */
  patch: text("patch"),
  created_at: text("created_at").notNull(),
});
