import type { Database } from "@workspace/db";
import type { Preferences, UpdatePreferences } from "@workspace/shared";
import { sql } from "drizzle-orm";

import { userPreferences } from "../tables";
import { getPreferences } from "./get-preferences";

/**
 * Saves any subset of the preferences, creating the row on first write. `ui`
 * merges key by key in one statement, so concurrent updates of different keys
 * both survive. `null` clears locale or timezone; omitted fields are untouched.
 */
export async function updatePreferences(
  db: Database,
  userId: string,
  input: UpdatePreferences,
): Promise<Preferences> {
  const patch = {
    ...(input.locale !== undefined ? { locale: input.locale } : {}),
    ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
  };
  const ui = input.ui ?? {};
  await db
    .insert(userPreferences)
    .values({ userId, ...patch, ui })
    .onConflictDoUpdate({
      target: userPreferences.userId,
      set: {
        ...patch,
        ui: sql`${userPreferences.ui} || excluded.ui`,
        updatedAt: new Date(),
      },
    });
  return getPreferences(db, userId);
}
