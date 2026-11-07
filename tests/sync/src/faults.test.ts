import { v7 as uuidv7 } from "uuid";
import { describe, expect, it, vi } from "vitest";

import type { SyncClient } from "./support/client";
import {
  activeReplicationSlots,
  dropReplicationSlots,
  faultContainer,
  startPowerSync,
  stopPowerSync,
  terminateDatabaseSessions,
} from "./support/stack";
import { useSyncSuite } from "./support/suite";
import { createUser, database, serverNote } from "./support/users";

// Seam 3, phase 7: process, connection and slot failures (ADR 0023/0024, runbook). The
// invariants: devices converge on the server, and queue conservation holds, meaning every
// local write ends applied or recorded as a rejected write, never silently dropped.
// These tests stop PowerSync and cut database sessions, so they run only when
// SYNC_TEST_POWERSYNC_CONTAINER names the container to disturb (see .agents/sync.md).

const newClient = useSyncSuite();
const long = { timeout: 90_000 };

async function liveNotes(userId: string) {
  const { rows } = await database.query<{ id: string; title: string; body: string }>(
    "SELECT id, title, body FROM notes WHERE user_id = $1 AND deleted_at IS NULL ORDER BY id",
    [userId],
  );
  return rows;
}

/** Waits until every client holds exactly the server's live notes of the user. */
function converge(userId: string, clients: SyncClient[]) {
  return vi.waitFor(async () => {
    const expected = await liveNotes(userId);
    for (const client of clients) {
      const local = await client.database.getAll<{ id: string; title: string; body: string }>(
        "SELECT id, title, body FROM notes ORDER BY id",
      );
      expect(local).toEqual(expected);
    }
  }, long);
}

/**
 * Queue conservation: the queue is empty and the client holds a permanent verdict for each of
 * the `writes` transactions it made (applied, or rejected and therefore recorded).
 */
async function expectConserved(client: SyncClient, writes: number) {
  await client.uploaded();
  expect(client.outcomes().size).toBe(writes);
  for (const outcome of client.outcomes().values()) {
    expect(["applied", "rejected"]).toContain(outcome.status);
  }
}

describe.skipIf(!faultContainer)("infrastructure faults", () => {
  it("converges after PowerSync is stopped and started while devices keep writing", async () => {
    const user = await createUser();
    const [a, b] = [await newClient(user), await newClient(user)];
    await Promise.all([a.connect(), b.connect()]);
    await a.createNote(uuidv7(), "Before", "outage");
    await a.uploaded();

    await stopPowerSync();
    // Uploads go through the API and still land; downloads wait for the service.
    for (let n = 0; n < 3; n++) await a.createNote(uuidv7(), `A during ${n}`);
    for (let n = 0; n < 3; n++) await b.createNote(uuidv7(), `B during ${n}`);
    await a.uploaded();
    await b.uploaded();
    expect(await liveNotes(user.userId)).toHaveLength(7);
    await startPowerSync();

    await converge(user.userId, [a, b]);
    await expectConserved(a, 1 + 3);
    await expectConserved(b, 3);
  });

  it("converges when every database session is cut during uploads and replication", async () => {
    const user = await createUser();
    const [a, b] = [await newClient(user), await newClient(user)];
    await Promise.all([a.connect(), b.connect()]);

    const writes = 12;
    const cutter = (async () => {
      for (let n = 0; n < 4; n++) {
        await terminateDatabaseSessions();
        await new Promise((resolve) => setTimeout(resolve, 150));
      }
    })();
    for (let n = 0; n < writes; n++) await a.createNote(uuidv7(), `Under fire ${n}`, `${n}`);
    await cutter;

    await converge(user.userId, [a, b]);
    await expectConserved(a, writes);
    expect(await liveNotes(user.userId)).toHaveLength(writes);
    // PowerSync reconnected its replication connection by itself.
    await vi.waitFor(async () => expect(await activeReplicationSlots()).toBeGreaterThan(0), long);
  });

  it("recovers from a dropped replication slot by resnapshotting, keeping pending writes", async () => {
    const user = await createUser();
    const [a, b] = [await newClient(user), await newClient(user)];
    await Promise.all([a.connect(), b.connect()]);
    const kept = uuidv7();
    await a.createNote(kept, "Existing", "before invalidation");
    await a.uploaded();
    await converge(user.userId, [a, b]);

    // A device writes offline while the replication path is lost.
    await a.disconnect();
    const pending = [uuidv7(), uuidv7()];
    await a.createNote(pending[0] ?? "", "Pending one");
    await a.createNote(pending[1] ?? "", "Pending two");
    expect(await a.queued()).toBe(2);

    // The runbook's invalidated-slot procedure: stop the service, drop the dead slot, start it.
    await stopPowerSync();
    const dropped = await dropReplicationSlots();
    expect(dropped.length).toBeGreaterThan(0);
    const direct = uuidv7();
    await database.query("INSERT INTO notes (id, user_id, title) VALUES ($1, $2, 'Direct')", [
      direct,
      user.userId,
    ]);
    await startPowerSync();
    await vi.waitFor(async () => expect(await activeReplicationSlots()).toBe(1), long);

    // The pending writes survived on the device and upload now.
    await a.connect();
    await expectConserved(a, 1 + 2);
    for (const id of pending) expect(await serverNote(id)).toBeDefined();

    // Existing devices and a brand new one all resnapshot to the same state.
    const fresh = await newClient(user);
    await fresh.connect();
    await converge(user.userId, [a, b, fresh]);
    expect(await fresh.noteIds()).toEqual([kept, direct, ...pending].toSorted());
  });
});
