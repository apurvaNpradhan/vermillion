import type { Database } from "@workspace/db";
import { gt } from "drizzle-orm";

import { authEmailOutbox } from "../tables";

/** Operational drain check: an insert may have persisted even when durable enqueue failed. */
export async function hasPendingEmails(db: Database) {
  const rows = await db
    .select({ id: authEmailOutbox.id })
    .from(authEmailOutbox)
    .where(gt(authEmailOutbox.expiresAt, new Date()))
    .limit(1);
  return rows.length > 0;
}
