import {
  addProgressPhoto,
  claimDeviceOwner,
  deleteProgressPhoto,
  newMediaId,
  powerSyncSchema,
} from "@workspace/sync";
import { describe, expect, it, vi } from "vitest";

import { type SyncClient } from "./support/client";
import { useSyncSuite, within } from "./support/suite";
import { createUser, database, type TestUser } from "./support/users";

// Seam 3 for progress photos (ADR 0041): the real photo store on headless clients, the real upload
// handlers and the real `my_body` and `my_media` streams. The files are not part of sync (the
// attachment queue moves them through presigned URLs); these tests are about the rows.

const newClient = useSyncSuite();

/** A device of the user, running the real schema and store, signed in and synced. */
async function device(user: TestUser): Promise<SyncClient> {
  const client = await newClient(user, {}, powerSyncSchema);
  await claimDeviceOwner(client.database, user.userId);
  await client.connect();
  return client;
}

const day = {
  local_date: new Date().toISOString().slice(0, 10),
  taken_at: new Date().toISOString(),
};
const image = () => ({
  id: newMediaId(),
  width: 1536,
  height: 2048,
  bytes: 400_000,
  thumbBytes: 30_000,
});

const photoIds = async (client: SyncClient) =>
  (await client.database.getAll<{ id: string }>("SELECT id FROM progress_photo ORDER BY id")).map(
    (row) => row.id,
  );
const mediaIds = async (client: SyncClient) =>
  (await client.database.getAll<{ id: string }>("SELECT id FROM media ORDER BY id")).map(
    (row) => row.id,
  );

describe("progress photo sync", () => {
  it("replicates a photo and its media to a second device, never to another account", async () => {
    const [alice, bob] = [await createUser(), await createUser()];
    const [a, a2, b] = [await device(alice), await device(alice), await device(bob)];

    const media = image();
    const id = await addProgressPhoto(a.database, { pose: "front", ...day, media });
    await a.uploaded();

    const stored = await database.query(
      "SELECT user_id, media_id, pose, local_date::text AS local_date, deleted_at FROM progress_photo WHERE id = $1",
      [id],
    );
    expect(stored.rows[0]).toMatchObject({
      user_id: alice.userId,
      media_id: media.id,
      pose: "front",
      local_date: day.local_date,
      deleted_at: null,
    });
    expect(
      (await database.query("SELECT kind, user_id FROM media WHERE id = $1", [media.id])).rows[0],
    ).toMatchObject({ kind: "progress_photo", user_id: alice.userId });

    // Alice's second device gets the photo and its media row; Bob's gets neither.
    await vi.waitFor(async () => {
      expect(await photoIds(a2)).toEqual([id]);
      expect(await mediaIds(a2)).toEqual([media.id]);
    }, within);
    expect(await a2.database.get("SELECT * FROM progress_photo")).toMatchObject({
      id,
      user_id: alice.userId,
      media_id: media.id,
      pose: "front",
    });
    expect(await photoIds(b)).toEqual([]);
    expect(await mediaIds(b)).toEqual([]);
  });

  it("replicates a Check-in's photos added offline once the device reconnects", async () => {
    const user = await createUser();
    const [a, b] = [await device(user), await device(user)];

    await a.database.disconnect();
    const front = await addProgressPhoto(a.database, { pose: "front", ...day, media: image() });
    const side = await addProgressPhoto(a.database, { pose: "side", ...day, media: image() });
    // At once, from the local rows, with no connection.
    expect((await photoIds(a)).sort()).toEqual([front, side].sort());
    expect(await photoIds(b)).toEqual([]);

    await a.connect();
    await a.uploaded();
    await vi.waitFor(
      async () => expect((await photoIds(b)).sort()).toEqual([front, side].sort()),
      within,
    );
    expect(await mediaIds(b)).toHaveLength(2);
  });

  it("replicates a delete: the photo and its media leave the other device and the server", async () => {
    const user = await createUser();
    const [a, b] = [await device(user), await device(user)];
    const media = image();
    const id = await addProgressPhoto(a.database, { pose: "back", ...day, media });
    await a.uploaded();
    await vi.waitFor(async () => expect(await photoIds(b)).toEqual([id]), within);

    expect(await deleteProgressPhoto(a.database, id)).toBe(media.id);
    await a.uploaded();
    await vi.waitFor(async () => {
      expect(await photoIds(b)).toEqual([]);
      expect(await mediaIds(b)).toEqual([]);
    }, within);

    // The server soft-deleted both; the media's objects are removed by the purge job.
    expect(
      (await database.query("SELECT deleted_at FROM progress_photo WHERE id = $1", [id])).rows[0]
        ?.deleted_at,
    ).not.toBeNull();
    expect(
      (await database.query("SELECT deleted_at FROM media WHERE id = $1", [media.id])).rows[0]
        ?.deleted_at,
    ).not.toBeNull();
    // Deleting a photo that is already gone does nothing.
    expect(await deleteProgressPhoto(a.database, id)).toBeNull();
  });

  it("refuses a photo that points at another account's media", async () => {
    const [alice, bob] = [await createUser(), await createUser()];
    const [a, b] = [await device(alice), await device(bob)];
    const media = image();
    await addProgressPhoto(a.database, { pose: "front", ...day, media });
    await Promise.all([a.uploaded(), b.uploaded()]);

    // Bob, as a tampered client with raw SQL, writes a photo row naming Alice's media.
    const id = newMediaId();
    await b.database.execute(
      `INSERT INTO progress_photo (id, user_id, media_id, pose, taken_at, local_date, created_at)
       VALUES (?, ?, ?, 'front', ?, ?, ?)`,
      [id, bob.userId, media.id, day.taken_at, day.local_date, new Date().toISOString()],
    );
    await b.uploaded();
    const verdicts = b.records.flatMap((r) => (r.kind === "result" ? [r.result] : []));
    expect(verdicts.map((v) => (v.status === "rejected" ? v.code : v.status))).toEqual(
      expect.arrayContaining(["MEDIA_REFERENCE_INVALID"]),
    );
    expect(
      (await database.query("SELECT id FROM progress_photo WHERE id = $1", [id])).rows,
    ).toEqual([]);
    expect(
      (await database.query("SELECT deleted_at FROM media WHERE id = $1", [media.id])).rows[0],
    ).toMatchObject({ deleted_at: null });
  });
});
