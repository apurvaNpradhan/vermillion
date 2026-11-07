import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { expect, vi } from "vitest";

import { services } from "../prerequisites";
import { database } from "./users";

const run = promisify(execFile);

/**
 * Fault injection at the infrastructure boundary (ADR 0024): stop and start the PowerSync
 * container, cut every Postgres session of the replicated database, drop its replication
 * slot. These disturb a shared service, so they run only when the person names the
 * container explicitly with SYNC_TEST_POWERSYNC_CONTAINER (the CI `sync` job does; locally
 * point it at a test stack, never at one other people use).
 */
export const faultContainer = process.env.SYNC_TEST_POWERSYNC_CONTAINER;

function container(): string {
  if (!faultContainer) throw new Error("SYNC_TEST_POWERSYNC_CONTAINER is not set");
  return faultContainer;
}

export async function waitForPowerSync() {
  await vi.waitFor(
    async () => {
      const response = await fetch(`${services.powersyncUrl}/probes/readiness`, {
        signal: AbortSignal.timeout(3_000),
      });
      expect(await response.text()).toContain('"ready":true');
    },
    { timeout: 90_000, interval: 500 },
  );
}

export async function stopPowerSync() {
  await run("docker", ["stop", "--time", "10", container()]);
}

export async function startPowerSync() {
  await run("docker", ["start", container()]);
  await waitForPowerSync();
}

/** Cuts every other session of the replicated database, the replication walsender included. */
export async function terminateDatabaseSessions(): Promise<number> {
  const { rows } = await database.query<{ terminated: boolean }>(
    `SELECT pg_terminate_backend(pid) AS terminated FROM pg_stat_activity
     WHERE datname = current_database() AND pid <> pg_backend_pid()`,
  );
  return rows.length;
}

/** Drops this database's inactive PowerSync slots (the runbook's invalidated-slot step 2). */
export async function dropReplicationSlots(): Promise<string[]> {
  const { rows } = await database.query<{ slot_name: string }>(
    `SELECT slot_name, pg_drop_replication_slot(slot_name) FROM pg_replication_slots
     WHERE slot_name LIKE 'powersync_%' AND database = current_database() AND NOT active`,
  );
  return rows.map((row) => row.slot_name);
}

export async function activeReplicationSlots(): Promise<number> {
  const { rows } = await database.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM pg_replication_slots
     WHERE slot_name LIKE 'powersync_%' AND database = current_database() AND active`,
  );
  return rows[0]?.n ?? 0;
}
