import { log } from "@workspace/logger";
import { SYNC_RETENTION_DAYS } from "@workspace/shared";
import { lt } from "drizzle-orm";
import { z } from "zod";

import { defineQueue } from "../jobs/index";
import { syncTableHandlers } from "./registry";
import { syncUploadReceipts } from "./tables";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Hard-deletes tombstones and upload receipts older than the retention period
 * (120 days, longer than the 90-day offline horizon; ADR 0019). Late writes
 * against a purged row are rejected, never resurrected.
 */
export const syncPurgeQueue = defineQueue({
  name: "sync.purge",
  schema: z.object({}),
  cron: "17 3 * * *",
  handler: async (_data, { services }) => {
    const cutoff = new Date(Date.now() - SYNC_RETENTION_DAYS * DAY_MS);
    const { db } = services;
    let tombstones = 0;
    for (const handler of syncTableHandlers) {
      tombstones += await handler.purgeTombstones(db, cutoff);
    }
    const receipts = await db
      .delete(syncUploadReceipts)
      .where(lt(syncUploadReceipts.createdAt, cutoff))
      .returning({ txId: syncUploadReceipts.txId });
    log.info({ action: "sync.purge", tombstones, receipts: receipts.length });
  },
});
