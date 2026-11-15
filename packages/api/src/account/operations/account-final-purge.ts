import { z } from "zod";

import { defineQueue } from "../../platform/jobs/index";
import { purgeUserData } from "../../platform/user-data";

/**
 * Runs once, well after an account was deleted (`MEDIA_FINAL_PURGE_DELAY_SECONDS`): an upload URL
 * signed before the deletion can still be used for a few minutes, and an upload that began just
 * before it expired can still be running. Whatever such an upload left in the user's prefix is
 * removed here. Idempotent, like the first purge.
 */
export const accountFinalPurgeQueue = defineQueue({
  name: "account.final-purge",
  schema: z.object({ userId: z.string().min(1) }),
  handler: async ({ userId }, { services }) => {
    await purgeUserData(services, userId);
  },
  describe: ({ userId }) => ({ userId }),
});
