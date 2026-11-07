import { z } from "zod";

import { defineQueue } from "../../platform/jobs/index";
import { purgeUserData } from "../../platform/user-data";

/** Removes whatever a deleted account left behind. Idempotent, so retries are safe. */
export const accountCleanupQueue = defineQueue({
  name: "account.cleanup",
  schema: z.object({ userId: z.string().min(1) }),
  handler: async ({ userId }, { services }) => {
    await purgeUserData(services.db, userId);
  },
  describe: ({ userId }) => ({ userId }),
});
