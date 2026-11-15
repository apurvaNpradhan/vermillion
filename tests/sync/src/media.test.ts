import {
  claimDeviceOwner,
  createProgram,
  deleteMedia,
  powerSyncSchema,
  setProgramCover,
  setProgramCoverToNewMedia,
} from "@workspace/sync";
import { describe, expect, it, vi } from "vitest";

import { type SyncClient } from "./support/client";
import { useSyncSuite, within } from "./support/suite";
import { createUser, database, type TestUser } from "./support/users";

// Seam 3 for user media (ADR 0040): the real media store on headless clients, the real upload
// handlers and the real `my_media` and `my_training` streams. The files themselves are not part
// of sync (the attachment queue moves them through presigned URLs); these tests are about the rows.

const newClient = useSyncSuite();

/** A device of the user, running the real schema and store, signed in and synced. */
async function device(user: TestUser): Promise<SyncClient> {
  const client = await newClient(user, {}, powerSyncSchema);
  await claimDeviceOwner(client.database, user.userId);
  await client.connect();
  return client;
}

const image = { width: 1024, height: 1024, bytes: 120_000, thumbBytes: 9_000 };
const programInput = { title: "Covered", description: null, planned_weeks: null };

const mediaIds = async (client: SyncClient) =>
  (await client.database.getAll<{ id: string }>("SELECT id FROM media ORDER BY id")).map(
    (row) => row.id,
  );

describe("user media sync", () => {
  it("replicates a cover and its media row to a second device, never to another account", async () => {
    const [alice, bob] = [await createUser(), await createUser()];
    const [a, a2, b] = [await device(alice), await device(alice), await device(bob)];

    const programId = await createProgram(a.database, programInput);
    const { mediaId } = await setProgramCoverToNewMedia(a.database, programId, image);
    await a.uploaded();

    // The server holds the row, owned by the session user, and the Program points at it.
    const stored = await database.query(
      "SELECT user_id, kind, mime, width, height, bytes, thumb_bytes, deleted_at FROM media WHERE id = $1",
      [mediaId],
    );
    expect(stored.rows[0]).toMatchObject({
      user_id: alice.userId,
      kind: "program_cover",
      mime: "image/jpeg",
      width: 1024,
      height: 1024,
      bytes: 120_000,
      thumb_bytes: 9_000,
      deleted_at: null,
    });
    expect(
      (await database.query("SELECT cover_media_id FROM program WHERE id = $1", [programId]))
        .rows[0],
    ).toMatchObject({ cover_media_id: mediaId });

    // Alice's second device gets both; Bob's gets neither, and the stream has run past them.
    await vi.waitFor(async () => {
      expect(await mediaIds(a2)).toEqual([mediaId]);
      expect(
        await a2.database.get("SELECT cover_media_id FROM program WHERE id = ?", [programId]),
      ).toMatchObject({ cover_media_id: mediaId });
    }, within);
    expect(await a2.database.get("SELECT * FROM media")).toMatchObject({
      id: mediaId,
      user_id: alice.userId,
      kind: "program_cover",
      thumb_bytes: 9_000,
    });
    expect(await mediaIds(b)).toEqual([]);
  });

  it("replicates replacing a cover: the old media leaves the other device", async () => {
    const user = await createUser();
    const [a, b] = [await device(user), await device(user)];
    const programId = await createProgram(a.database, programInput);
    const first = await setProgramCoverToNewMedia(a.database, programId, image);
    await a.uploaded();
    await vi.waitFor(async () => expect(await mediaIds(b)).toEqual([first.mediaId]), within);

    const second = await setProgramCoverToNewMedia(a.database, programId, image);
    expect(second.replaced).toBe(first.mediaId);
    await a.uploaded();
    await vi.waitFor(async () => {
      expect(await mediaIds(b)).toEqual([second.mediaId]);
      expect(
        await b.database.get("SELECT cover_media_id FROM program WHERE id = ?", [programId]),
      ).toMatchObject({ cover_media_id: second.mediaId });
    }, within);

    // The server soft-deleted the first one; its objects are removed by the purge job.
    const old = await database.query("SELECT deleted_at FROM media WHERE id = $1", [first.mediaId]);
    expect(old.rows[0]?.deleted_at).not.toBeNull();
  });

  it("replicates a cover picked offline once the device reconnects", async () => {
    const user = await createUser();
    const [a, b] = [await device(user), await device(user)];
    const programId = await createProgram(a.database, programInput);
    await a.uploaded();
    await vi.waitFor(
      async () => expect((await b.database.getAll("SELECT id FROM program")).length).toBe(1),
      within,
    );

    await a.database.disconnect();
    const { mediaId } = await setProgramCoverToNewMedia(a.database, programId, image);
    // At once, from the local row, with no connection.
    expect(await mediaIds(a)).toEqual([mediaId]);
    expect(await mediaIds(b)).toEqual([]);

    await a.connect();
    await a.uploaded();
    await vi.waitFor(async () => expect(await mediaIds(b)).toEqual([mediaId]), within);
  });

  it("replicates a delete, and removing the cover clears the reference", async () => {
    const user = await createUser();
    const [a, b] = [await device(user), await device(user)];
    const programId = await createProgram(a.database, programInput);
    const { mediaId } = await setProgramCoverToNewMedia(a.database, programId, image);
    await a.uploaded();
    await vi.waitFor(async () => expect(await mediaIds(b)).toEqual([mediaId]), within);

    expect(await setProgramCover(a.database, programId, null)).toBe(mediaId);
    await a.uploaded();
    await vi.waitFor(async () => {
      expect(await mediaIds(b)).toEqual([]);
      expect(
        await b.database.get("SELECT cover_media_id FROM program WHERE id = ?", [programId]),
      ).toMatchObject({ cover_media_id: null });
    }, within);
    const row = await database.query("SELECT deleted_at FROM media WHERE id = $1", [mediaId]);
    expect(row.rows[0]?.deleted_at).not.toBeNull();

    // Deleting a media that is already gone does nothing.
    expect(await deleteMedia(a.database, mediaId)).toBe(false);
  });

  it("refuses another user's media as a cover and a write against their media row", async () => {
    const [alice, bob] = [await createUser(), await createUser()];
    const [a, b] = [await device(alice), await device(bob)];
    const programId = await createProgram(b.database, programInput);
    const { mediaId } = await setProgramCoverToNewMedia(
      a.database,
      await createProgram(a.database, programInput),
      image,
    );
    await Promise.all([a.uploaded(), b.uploaded()]);

    // Bob, as a tampered client with raw SQL: points his Program at Alice's media, claims her
    // media id with a row of his own, then deletes it. All three are refused.
    const stamp = new Date().toISOString();
    await b.database.execute("UPDATE program SET cover_media_id = ? WHERE id = ?", [
      mediaId,
      programId,
    ]);
    await b.database.execute(
      `INSERT INTO media (id, user_id, kind, mime, width, height, bytes, thumb_bytes, created_at)
       VALUES (?, ?, 'program_cover', 'image/jpeg', 10, 10, 10, 10, ?)`,
      [mediaId, bob.userId, stamp],
    );
    await b.database.execute("DELETE FROM media WHERE id = ?", [mediaId]);
    await b.uploaded();
    const verdicts = b.records.flatMap((r) => (r.kind === "result" ? [r.result] : []));
    expect(verdicts.map((v) => (v.status === "rejected" ? v.code : v.status))).toEqual(
      expect.arrayContaining(["MEDIA_REFERENCE_INVALID", "SYNC_ID_CONFLICT"]),
    );

    const stored = await database.query("SELECT user_id, deleted_at FROM media WHERE id = $1", [
      mediaId,
    ]);
    expect(stored.rows[0]).toMatchObject({ user_id: alice.userId, deleted_at: null });
    expect(
      (await database.query("SELECT cover_media_id FROM program WHERE id = $1", [programId]))
        .rows[0],
    ).toMatchObject({ cover_media_id: null });
  });
});
