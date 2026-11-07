import { createdAt, id, updatedAt } from "@workspace/db/columns";
import { user } from "@workspace/db/schema/auth";
import { SUPPORTED_LOCALES, type UiPreferencesPatch } from "@workspace/shared";
import { jsonb, pgTable, text } from "drizzle-orm/pg-core";

/**
 * One row per user, created on the first write. A missing row means every
 * preference is at its default. `ui` holds only what the user changed; the
 * shared schema fills in defaults when it is read.
 */
export const userPreferences = pgTable("user_preferences", {
  id: id(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: "cascade" }),
  locale: text("locale", { enum: SUPPORTED_LOCALES }),
  timezone: text("timezone"),
  ui: jsonb("ui").$type<UiPreferencesPatch>().notNull().default({}),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
