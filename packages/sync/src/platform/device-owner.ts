import type { AbstractPowerSyncDatabase } from "@powersync/common";

const SINGLETON_ID = "owner";

export type DeviceOwnerDatabase = Pick<
  AbstractPowerSyncDatabase,
  "getOptional" | "writeTransaction"
>;

/** The user whose data this database holds, or null on a database nobody has claimed. */
export async function readDeviceOwner(
  database: Pick<AbstractPowerSyncDatabase, "getOptional">,
): Promise<string | null> {
  const row = await database.getOptional<{ user_id: string }>(
    "SELECT user_id FROM device_owner WHERE id = ?",
    [SINGLETON_ID],
  );
  return row?.user_id ?? null;
}

/**
 * Records `userId` as the Device owner unless one exists. Returns the owner after the call, so a
 * second tab that lost the race sees the first tab's choice and can refuse a mismatch.
 */
export async function claimDeviceOwner(
  database: DeviceOwnerDatabase,
  userId: string,
): Promise<string> {
  return database.writeTransaction(async (tx) => {
    const existing = await tx.getOptional<{ user_id: string }>(
      "SELECT user_id FROM device_owner WHERE id = ?",
      [SINGLETON_ID],
    );
    if (existing) return existing.user_id;
    await tx.execute("INSERT INTO device_owner (id, user_id, created_at) VALUES (?, ?, ?)", [
      SINGLETON_ID,
      userId,
      new Date().toISOString(),
    ]);
    return userId;
  });
}
