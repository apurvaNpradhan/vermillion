import type { AbstractPowerSyncDatabase } from "@powersync/common";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { ownerOf, write, type Tx } from "../store-common";
import { historyImportReceipt, session } from "../tables";

const count = z.number().int().nonnegative();
const legacyReceiptSchema = z.object({
  batchId: z.uuid(),
  importedAt: z.iso.datetime(),
  format: z.enum(["strong", "hevy"]),
  sessions: count,
  sets: count,
  createdExercises: count,
  skippedDuplicates: count,
  skippedOther: count,
  from: z.iso.datetime().nullable(),
  to: z.iso.datetime().nullable(),
});
const receiptSchema = legacyReceiptSchema.extend({
  omittedSets: count,
  omittedExercises: count,
  oversized: count,
  legacy: z.literal(true).optional(),
  complete: z.boolean(),
  undoStarted: z.boolean(),
});
export type ImportReceipt = z.infer<typeof receiptSchema>;

function parseReceipt(text: string): ImportReceipt {
  return receiptSchema.parse(JSON.parse(text));
}

export async function readImportReceipt(database: AbstractPowerSyncDatabase, userId: string) {
  const row = await database.getOptional<{ receipt: string }>(
    "SELECT receipt FROM history_import_receipt WHERE id = ?",
    [userId],
  );
  return row ? parseReceipt(row.receipt) : null;
}

export async function storeImportReceipt(tx: Tx, userId: string, receipt: ImportReceipt) {
  // PowerSync exposes local tables as views, which do not support SQLite UPSERT.
  await tx.delete(historyImportReceipt).where(eq(historyImportReceipt.id, userId));
  await tx.insert(historyImportReceipt).values({ id: userId, receipt: JSON.stringify(receipt) });
}

export async function readReceiptInWrite(tx: Tx, userId: string) {
  const [row] = await tx
    .select()
    .from(historyImportReceipt)
    .where(eq(historyImportReceipt.id, userId))
    .limit(1);
  return row ? parseReceipt(row.receipt) : null;
}

/** The old device-wide receipt can be attributed only if its batch lives under this account. */
export async function adoptLegacyImportReceipt(
  database: AbstractPowerSyncDatabase,
  userId: string,
  expectedInstallId: string,
  text: string,
): Promise<ImportReceipt | null> {
  let legacy: z.infer<typeof legacyReceiptSchema>;
  try {
    legacy = legacyReceiptSchema.parse(JSON.parse(text));
  } catch {
    return null;
  }
  return write(
    database,
    expectedInstallId,
    async (tx) => {
      if ((await ownerOf(tx)) !== userId) return null;
      const current = await readReceiptInWrite(tx, userId);
      if (current) return current;
      const [workout] = await tx
        .select({ id: session.id })
        .from(session)
        .where(and(eq(session.import_batch_id, legacy.batchId), eq(session.user_id, userId)))
        .limit(1);
      if (!workout) return null;
      const receipt: ImportReceipt = {
        ...legacy,
        omittedSets: 0,
        omittedExercises: 0,
        oversized: 0,
        legacy: true,
        complete: true,
        undoStarted: false,
      };
      await storeImportReceipt(tx, userId, receipt);
      return receipt;
    },
    { reconcileRuns: false },
  );
}
