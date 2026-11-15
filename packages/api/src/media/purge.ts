import { log } from "@workspace/logger";
import { z } from "zod";

import { defineQueue } from "../platform/jobs/index";
import { purgeDeletedMediaObjects } from "./operations/purge-objects";

/**
 * Hourly: deletes the bucket objects of media deleted at least an hour ago (ADR 0040), so a
 * deleted photo is gone within a day, long before the 120-day tombstone purge. Idempotent.
 */
export const mediaPurgeQueue = defineQueue({
  name: "media.purge-objects",
  schema: z.object({}),
  cron: "7 * * * *",
  handler: async (_data, { services }) => {
    const purged = await purgeDeletedMediaObjects(services);
    log.info({ action: "media.purge-objects", purged });
  },
});
