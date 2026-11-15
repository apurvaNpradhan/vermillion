import { and, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { softDeleteMedia } from "../media/index";
import { defineQueue } from "../platform/jobs/index";
import { lockUserTraining } from "./operations/lookup";
import { session, sessionPhoto } from "./tables";

/** A minute leaves room for Undo and its upload. A restored Session neutralises the job. */
export const sessionMediaCleanupQueue = defineQueue({
  name: "training.session-media-cleanup",
  schema: z.object({ userId: z.string().min(1), sessionId: z.uuid() }),
  handler: async ({ userId, sessionId }, { services }) => {
    await services.db.transaction(async (tx) => {
      await lockUserTraining(tx, userId);
      const [row] = await tx
        .select()
        .from(session)
        .where(and(eq(session.id, sessionId), eq(session.userId, userId)))
        .limit(1);
      if (!row?.deletedAt || row.deletedAt.getTime() > Date.now() - 60_000) return;
      const photos = await tx
        .select()
        .from(sessionPhoto)
        .where(and(eq(sessionPhoto.sessionId, sessionId), isNotNull(sessionPhoto.deletedAt)));
      for (const photo of photos) await softDeleteMedia(tx, userId, photo.mediaId);
    });
  },
  describe: ({ userId, sessionId }) => ({ userId, sessionId }),
});
