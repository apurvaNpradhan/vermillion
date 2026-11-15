import type { AbstractPowerSyncDatabase } from "@powersync/common";
import { wrapPowerSyncWithDrizzle } from "@powersync/drizzle-driver";
import { measurementPatch, measurementInput, type MeasurementInput } from "@workspace/shared";
import { eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { drizzleSchema } from "../platform/schema";
import { deviceOwner, installMeta } from "../platform/tables";
import { bodyMeasurement } from "./tables";
export type MeasurementRow = typeof bodyMeasurement.$inferSelect;
const open = (db: AbstractPowerSyncDatabase) =>
  wrapPowerSyncWithDrizzle(db, { schema: drizzleSchema });
type Tx = Parameters<Parameters<ReturnType<typeof open>["transaction"]>[0]>[0];
async function write<T>(
  db: AbstractPowerSyncDatabase,
  scope: string,
  run: (tx: Tx, owner: string) => Promise<T>,
) {
  return open(db).transaction(async (tx) => {
    const [install] = await tx
      .select()
      .from(installMeta)
      .where(eq(installMeta.install_id, scope))
      .limit(1);
    const [owner] = await tx.select().from(deviceOwner).limit(1);
    if (!install || !owner) throw new Error("Device owner changed");
    return run(tx, owner.user_id);
  });
}
/** Writes one validated measurement inside a transaction the caller owns. Returns its id. */
export async function insertMeasurement(
  tx: Tx,
  owner: string,
  value: MeasurementInput,
): Promise<string> {
  const id = uuidv7();
  await tx.insert(bodyMeasurement).values({
    ...value,
    id,
    user_id: owner,
    created_at: new Date().toISOString(),
  });
  return id;
}
export function logMeasurements(
  db: AbstractPowerSyncDatabase,
  entries: readonly MeasurementInput[],
  scope: string,
) {
  const values = entries.map((e) => measurementInput.parse(e));
  // Each measurement is independent. Separate queue transactions keep one rejected site
  // from rolling back the rest of a Check-in under the atomic upload protocol.
  return (async () => {
    const ids: string[] = [];
    for (const value of values) {
      ids.push(await write(db, scope, (tx, owner) => insertMeasurement(tx, owner, value)));
    }
    return ids;
  })();
}
export async function logMeasurement(
  db: AbstractPowerSyncDatabase,
  entry: MeasurementInput,
  scope: string,
) {
  return (await logMeasurements(db, [entry], scope))[0];
}
export function updateMeasurement(
  db: AbstractPowerSyncDatabase,
  id: string,
  patch: Partial<MeasurementInput>,
  scope: string,
) {
  const fields = measurementPatch.parse(patch);
  return write(db, scope, async (tx) => {
    const [row] = await tx
      .select()
      .from(bodyMeasurement)
      .where(eq(bodyMeasurement.id, id))
      .limit(1);
    if (!row) return;
    measurementInput.parse({
      metric: row.metric,
      value: row.value,
      measured_at: new Date(row.measured_at).toISOString(),
      local_date: row.local_date,
      source: row.source,
      ...fields,
    });
    await tx.update(bodyMeasurement).set(fields).where(eq(bodyMeasurement.id, id));
  });
}
export function deleteMeasurement(db: AbstractPowerSyncDatabase, id: string, scope: string) {
  return write(db, scope, async (tx) => {
    const [row] = await tx
      .select()
      .from(bodyMeasurement)
      .where(eq(bodyMeasurement.id, id))
      .limit(1);
    if (row) await tx.delete(bodyMeasurement).where(eq(bodyMeasurement.id, id));
    return row ?? null;
  });
}
export function restoreMeasurement(
  db: AbstractPowerSyncDatabase,
  row: MeasurementRow,
  scope: string,
) {
  return write(db, scope, async (tx, owner) => {
    if (owner !== row.user_id) throw new Error("Device owner changed");
    const [existing] = await tx
      .select({ id: bodyMeasurement.id })
      .from(bodyMeasurement)
      .where(eq(bodyMeasurement.id, row.id))
      .limit(1);
    if (existing) return;
    await tx
      .insert(bodyMeasurement)
      .values({ ...row, measured_at: new Date(row.measured_at).toISOString(), restore: 1 });
  });
}
