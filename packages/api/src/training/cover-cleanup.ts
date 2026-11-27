import type { Database, DbExecutor } from "@workspace/db";
import { log } from "@workspace/logger";
import { and, eq, inArray, isNotNull, isNull, lte, notExists, or } from "drizzle-orm";
import { z } from "zod";

import { media } from "../media/index";
import { defineQueue } from "../platform/jobs/index";
import { SyncRejection } from "../platform/sync/handler";
import { lockUserTraining } from "./operations/lookup";
import { program, workout } from "./tables";

const COVER_KINDS = ["program_cover", "workout_cover"] as const;
const GRACE_MS = 7 * 24 * 60 * 60 * 1000;

export async function resetCoverGrace(db: DbExecutor, ids: readonly string[]) {
  if (ids.length === 0) return;
  await db
    .update(media)
    .set({ coverUnreferencedAt: null })
    .where(and(inArray(media.id, ids), isNotNull(media.coverUnreferencedAt)));
}

/** Call under the training lock. An initial PUT with a cover is a copy of an existing plan. */
export async function resolveCover(
  db: DbExecutor,
  userId: string,
  id: string | null,
  current: string | null,
  kind: (typeof COVER_KINDS)[number],
  copy = false,
) {
  if (id === null) return null;
  const [row] = await db
    .select()
    .from(media)
    .where(and(eq(media.id, id), eq(media.userId, userId)));
  if (row?.kind !== kind) throw new SyncRejection("MEDIA_REFERENCE_INVALID");
  if (row.deletedAt !== null) {
    if (copy) return null;
    if (id !== current) throw new SyncRejection("MEDIA_REFERENCE_INVALID");
  } else {
    await resetCoverGrace(db, [id]);
  }
  return id;
}

/** Keep a cover for a full grace period after the first sweep that finds it unreferenced. */
async function retireUnusedCovers(db: Database, now: Date) {
  const cutoff = new Date(now.getTime() - GRACE_MS);
  const candidates = and(
    inArray(media.kind, COVER_KINDS),
    isNull(media.deletedAt),
    or(isNull(media.coverUnreferencedAt), lte(media.coverUnreferencedAt, cutoff)),
  );
  const unreferenced = (tx: DbExecutor) =>
    and(
      notExists(
        tx
          .select({ id: program.id })
          .from(program)
          .where(
            and(
              eq(program.userId, media.userId),
              eq(program.coverMediaId, media.id),
              isNull(program.deletedAt),
            ),
          ),
      ),
      notExists(
        tx
          .select({ id: workout.id })
          .from(workout)
          .where(
            and(
              eq(workout.userId, media.userId),
              eq(workout.coverMediaId, media.id),
              isNull(workout.deletedAt),
            ),
          ),
      ),
    );
  const owners = await db
    .selectDistinct({ id: media.userId })
    .from(media)
    .where(and(candidates, unreferenced(db)));
  let retired = 0;
  for (const { id } of owners) {
    retired += await db.transaction(async (tx) => {
      // Attachment, copy and restore take this same lock. Recheck references after acquiring it.
      await lockUserTraining(tx, id);
      const eligible = and(candidates, eq(media.userId, id), unreferenced(tx));
      const rows = await tx
        .update(media)
        .set({ deletedAt: now })
        .where(and(eligible, lte(media.coverUnreferencedAt, cutoff)))
        .returning({ id: media.id });
      await tx
        .update(media)
        .set({ coverUnreferencedAt: now })
        .where(and(eligible, isNull(media.coverUnreferencedAt)));
      return rows.length;
    });
  }
  return retired;
}

export const coverCleanupQueue = defineQueue({
  name: "training.cover-cleanup",
  schema: z.object({}),
  cron: "17 * * * *",
  handler: async (_data, { services }) => {
    const retired = await retireUnusedCovers(services.db, new Date());
    log.info({ action: "training.cover-cleanup", retired });
  },
});
