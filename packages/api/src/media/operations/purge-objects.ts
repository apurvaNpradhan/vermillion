import type { Database } from "@workspace/db";
import { logFailure } from "@workspace/logger";
import { mediaObjectKey, MEDIA_VARIANTS } from "@workspace/shared";
import { and, asc, eq, isNotNull, isNull, lte } from "drizzle-orm";

import type { ObjectStore } from "../storage";
import { media } from "../tables";

/** A deleted media keeps its objects this long, so a late upload or an Undo cannot race the delete. */
export const PURGE_GRACE_MS = 60 * 60 * 1000;
const BATCH = 100;

/**
 * Deletes the bucket objects of media deleted at least an hour ago and marks them. Idempotent: a
 * media whose objects are gone is marked once, a failure leaves the row for the next run.
 * Returns how many media it purged.
 */
export async function purgeDeletedMediaObjects(
  context: { db: Database; objectStore: ObjectStore },
  now: Date = new Date(),
): Promise<number> {
  const cutoff = new Date(now.getTime() - PURGE_GRACE_MS);
  let purged = 0;
  // Rows that failed stay unmarked: skip them for the rest of this run instead of looping on them.
  const failed = new Set<string>();
  for (;;) {
    const rows = await context.db
      .select({ id: media.id, userId: media.userId })
      .from(media)
      .where(
        and(
          isNotNull(media.deletedAt),
          lte(media.deletedAt, cutoff),
          isNull(media.objectsPurgedAt),
        ),
      )
      .orderBy(asc(media.deletedAt))
      .limit(BATCH + failed.size);
    const todo = rows.filter((row) => !failed.has(row.id)).slice(0, BATCH);
    if (todo.length === 0) return purged;
    for (const row of todo) {
      try {
        for (const variant of MEDIA_VARIANTS) {
          await context.objectStore.deleteObject(mediaObjectKey(row.userId, row.id, variant));
        }
        await context.db
          .update(media)
          .set({ objectsPurgedAt: new Date() })
          .where(eq(media.id, row.id));
        purged += 1;
      } catch {
        failed.add(row.id);
        logFailure("media.purge-objects", { mediaId: row.id });
      }
    }
  }
}
