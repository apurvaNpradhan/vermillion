import { user } from "@workspace/db/schema/auth";
import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Server-side settings the admin changes at runtime, one row per key. Each key's value is typed
 * JSON validated by its own zod schema (`platform/settings/settings.ts`). Not synced.
 */
export const appSetting = pgTable("app_setting", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<string | number | boolean | null>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
});
