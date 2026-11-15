import type { Database } from "@workspace/db";
import { and, eq, isNull } from "drizzle-orm";

import { media } from "../tables";

/**
 * The first step of an account deletion: every media of the user counts as deleted, so no URL is
 * signed for it from now on (signing needs a live media row). Idempotent. URLs already signed stay
 * valid until they expire; the final purge after the deletion removes what they upload.
 */
export async function retireUserMedia(db: Database, userId: string) {
  await db
    .update(media)
    .set({ deletedAt: new Date() })
    .where(and(eq(media.userId, userId), isNull(media.deletedAt)));
}
