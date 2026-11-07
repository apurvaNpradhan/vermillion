import type { Database } from "@workspace/db";
import { eq } from "drizzle-orm";

import { userPreferences } from "../tables";

/** Removes the user's preferences row. Idempotent. */
export async function purgePreferences(db: Database, userId: string) {
  await db.delete(userPreferences).where(eq(userPreferences.userId, userId));
}
