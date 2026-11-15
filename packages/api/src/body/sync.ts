import { measurementPatch, measurementInput } from "@workspace/shared";
import { and, eq, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { SyncRejection, type SyncTableHandler } from "../platform/sync/handler";
import { bodyMeasurement, deletedBodyMeasurement } from "./tables";
const put = measurementInput.safeExtend({
  restore: z.union([z.literal(0), z.literal(1)]).optional(),
});
export const bodySyncHandler: SyncTableHandler = {
  table: "body_measurement",
  async apply(db, userId, op) {
    if (!z.uuid().safeParse(op.id).success) throw new SyncRejection("SYNC_INVALID_OP");
    await db.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId}))`);
    const [marker] = await db
      .select()
      .from(deletedBodyMeasurement)
      .where(eq(deletedBodyMeasurement.id, op.id))
      .limit(1);
    if (marker)
      throw new SyncRejection(marker.userId === userId ? "SYNC_ROW_DELETED" : "SYNC_ID_CONFLICT");
    const [row] = await db
      .select()
      .from(bodyMeasurement)
      .where(eq(bodyMeasurement.id, op.id))
      .limit(1);
    if (row && row.userId !== userId)
      throw new SyncRejection(op.op === "PUT" ? "SYNC_ID_CONFLICT" : "SYNC_ROW_NOT_FOUND");
    if (op.op === "DELETE") {
      if (!row) throw new SyncRejection("SYNC_ROW_NOT_FOUND");
      if (!row.deletedAt)
        await db
          .update(bodyMeasurement)
          .set({ deletedAt: new Date(), updatedAt: new Date() })
          .where(eq(bodyMeasurement.id, op.id));
      return;
    }
    if (op.op === "PATCH" && !row) throw new SyncRejection("SYNC_ROW_NOT_FOUND");
    const parsed = (op.op === "PUT" ? put : measurementPatch).safeParse(op.opData ?? {});
    if (!parsed.success) throw new SyncRejection("SYNC_INVALID_OP");
    const restoring = op.op === "PUT" && put.parse(op.opData).restore === 1;
    if (row?.deletedAt && !restoring) throw new SyncRejection("SYNC_ROW_DELETED");
    if (!row && restoring) throw new SyncRejection("SYNC_ROW_NOT_FOUND");
    // Strip the upload-only restore marker before validating the measurement contract.
    const { restore: _restore, ...candidate } = { ...parsed.data, restore: restoring };
    const valid = measurementInput.safeParse({
      ...(row
        ? {
            metric: row.metric,
            value: row.value,
            measured_at: row.measuredAt.toISOString(),
            local_date: row.localDate,
            source: row.source,
          }
        : {}),
      ...candidate,
    });
    if (!valid.success) throw new SyncRejection("SYNC_INVALID_OP");
    const v = valid.data;
    const values = {
      metric: v.metric,
      value: v.value,
      measuredAt: new Date(v.measured_at),
      localDate: v.local_date,
      source: v.source,
      updatedAt: new Date(),
      deletedAt: null,
    };
    if (row) await db.update(bodyMeasurement).set(values).where(eq(bodyMeasurement.id, op.id));
    else {
      if (!z.uuidv7().safeParse(op.id).success) throw new SyncRejection("SYNC_INVALID_OP");
      await db.insert(bodyMeasurement).values({ id: op.id, userId, ...values });
    }
  },
  async purgeTombstones(db, olderThan) {
    const rows = await db
      .select({ id: bodyMeasurement.id, userId: bodyMeasurement.userId })
      .from(bodyMeasurement)
      .where(lt(bodyMeasurement.deletedAt, olderThan));
    for (const row of rows) {
      await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${row.userId}))`);
        const [removed] = await tx
          .delete(bodyMeasurement)
          .where(and(eq(bodyMeasurement.id, row.id), lt(bodyMeasurement.deletedAt, olderThan)))
          .returning({ id: bodyMeasurement.id });
        if (removed) await tx.insert(deletedBodyMeasurement).values(row).onConflictDoNothing();
      });
    }
    return rows.length;
  },
};
