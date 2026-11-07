import type { Database } from "@workspace/db";
import { uiPreferencesSchema, type Preferences } from "@workspace/shared";
import { eq } from "drizzle-orm";

import { userPreferences } from "../tables";

/** The user's saved preferences; a missing row reads as all defaults. */
export async function getPreferences(db: Database, userId: string): Promise<Preferences> {
  const [row] = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1);
  // A stored value that no longer parses (an old shape) falls back to defaults.
  const ui = uiPreferencesSchema.safeParse(row?.ui ?? {});
  return {
    locale: row?.locale ?? null,
    timezone: row?.timezone ?? null,
    ui: ui.success ? ui.data : uiPreferencesSchema.parse({}),
  };
}
