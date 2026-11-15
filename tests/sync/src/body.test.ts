import {
  claimDeviceOwner,
  ensureInstallId,
  logMeasurement,
  logMeasurements,
  watchMetric,
  updateMeasurement,
  deleteMeasurement,
  restoreMeasurement,
  powerSyncSchema,
} from "@workspace/sync";
import { it, expect, vi } from "vitest";
import { useSyncSuite, within } from "./support/suite";
import { createUser } from "./support/users";
const newClient = useSyncSuite();
it("delivers an offline weigh-in to another device and isolates another account", async () => {
  const user = await createUser();
  const other = await createUser();
  const a = await newClient(user, {}, powerSyncSchema);
  const b = await newClient(user, {}, powerSyncSchema);
  const c = await newClient(other, {}, powerSyncSchema);
  for (const client of [a, b]) await claimDeviceOwner(client.database, user.userId);
  await claimDeviceOwner(c.database, other.userId);
  await Promise.all([a.connect(), b.connect(), c.connect()]);
  await a.database.disconnect();
  const scope = await ensureInstallId(a.database);
  const id = await logMeasurement(
    a.database,
    {
      metric: "weight",
      value: 80,
      measured_at: new Date().toISOString(),
      local_date: new Date().toISOString().slice(0, 10),
      source: "manual",
    },
    scope,
  );
  expect(
    await a.database.getOptional("SELECT id FROM body_measurement WHERE id = ?", [id]),
  ).not.toBeNull();
  await a.connect();
  await a.uploaded();
  await vi.waitFor(
    async () =>
      expect(
        await b.database.getOptional("SELECT value FROM body_measurement WHERE id = ?", [id]),
      ).toMatchObject({ value: 80 }),
    within,
  );
  expect(
    await c.database.getOptional("SELECT id FROM body_measurement WHERE id = ?", [id]),
  ).toBeNull();
  if (!id) throw new Error("Missing measurement id");
  const bScope = await ensureInstallId(b.database);
  await updateMeasurement(b.database, id, { value: 81 }, bScope);
  await b.uploaded();
  await vi.waitFor(
    async () =>
      expect(
        await a.database.getOptional("SELECT value FROM body_measurement WHERE id = ?", [id]),
      ).toMatchObject({ value: 81 }),
    within,
  );
  const deleted = await deleteMeasurement(b.database, id, bScope);
  if (!deleted) throw new Error("Missing deleted row");
  await b.uploaded();
  await vi.waitFor(
    async () =>
      expect(
        await a.database.getOptional("SELECT id FROM body_measurement WHERE id = ?", [id]),
      ).toBeNull(),
    within,
  );
  await restoreMeasurement(b.database, deleted, bScope);
  await b.uploaded();
  await vi.waitFor(
    async () =>
      expect(
        await a.database.getOptional("SELECT value FROM body_measurement WHERE id = ?", [id]),
      ).toMatchObject({ value: 81 }),
    within,
  );
  let observed: number[] = [];
  let failed = false;
  const stop = watchMetric(b.database, "weight", {
    onEntries: (rows) => {
      observed = rows.map((row) => row.value);
    },
    onError: () => {
      failed = true;
    },
  });
  try {
    await vi.waitFor(() => expect(observed).toEqual([81]), within);
    expect(failed).toBe(false);
  } finally {
    stop();
  }
  await expect(
    logMeasurement(
      b.database,
      {
        metric: "weight",
        value: 80,
        measured_at: new Date().toISOString(),
        local_date: new Date().toISOString().slice(0, 10),
        source: "manual",
      },
      "stale-scope",
    ),
  ).rejects.toThrow();
});

it("syncs a six-site Check-in from one batch call", async () => {
  const user = await createUser();
  const a = await newClient(user, {}, powerSyncSchema);
  const b = await newClient(user, {}, powerSyncSchema);
  for (const client of [a, b]) await claimDeviceOwner(client.database, user.userId);
  await Promise.all([a.connect(), b.connect()]);
  const scope = await ensureInstallId(a.database);
  const now = new Date().toISOString();
  const metrics = [
    "waist",
    "chest",
    "left_bicep",
    "right_bicep",
    "left_thigh",
    "right_thigh",
  ] as const;
  const ids = await logMeasurements(
    a.database,
    metrics.map((metric) => ({
      metric,
      value: 40,
      measured_at: now,
      local_date: now.slice(0, 10),
      source: "manual",
    })),
    scope,
  );
  await a.uploaded();
  await vi.waitFor(async () => {
    const rows = await b.database.getAll("SELECT id FROM body_measurement");
    expect(rows).toHaveLength(6);
  }, within);
  expect(ids).toHaveLength(6);
});
