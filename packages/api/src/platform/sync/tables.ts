import { user } from "@workspace/db/schema/auth";
import type { SyncUploadResult } from "@workspace/shared";
import {
  bigint,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * One row per client transaction the server decided on (ADR 0018). Inserted in
 * the same Postgres transaction as the writes, so concurrent duplicates block on
 * the primary key and a retry gets the stored outcome. Purged after 120 days.
 */
export const syncUploadReceipts = pgTable(
  "sync_upload_receipts",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    installId: uuid("install_id").notNull(),
    txId: bigint("tx_id", { mode: "number" }).notNull(),
    /** sha256 of the canonical operations. */
    digest: text("digest").notNull(),
    /** Null only inside the claiming transaction, before the operations ran. */
    outcome: jsonb("outcome").$type<SyncUploadResult>(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.installId, table.txId] }),
    index("sync_upload_receipts_created_at_idx").on(table.createdAt),
  ],
);
