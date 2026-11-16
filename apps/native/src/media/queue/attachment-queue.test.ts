import { AttachmentState } from "@powersync/common";
import { claimDeviceOwner, createMedia, deleteMedia, newMediaId } from "@workspace/sync";
import { afterEach, describe, expect, it } from "vitest";

import { createMediaQueue, type MediaQueue } from "./attachment-queue";
import {
  createDiskStorage,
  createFakeBucket,
  createTestDatabase,
  eventually,
  settle,
  writePickedFiles,
} from "./test-kit";

const image = {
  kind: "program_cover",
  width: 1024,
  height: 1024,
  bytes: 100,
  thumbBytes: 10,
} as const;

const rigs: Array<{ close(): Promise<void> }> = [];

async function setup(
  options: { fullCacheBytes?: number; hold?: boolean; fullBytes?: number } = {},
) {
  const db = await createTestDatabase();
  const storage = createDiskStorage();
  const bucket = createFakeBucket({ hold: options.hold, fullBytes: options.fullBytes });
  const queue = createMediaQueue(db.database, bucket.urls, bucket.send, storage, {
    fullCacheBytes: options.fullCacheBytes,
  });
  const rig = {
    db: db.database,
    storage,
    bucket,
    queue,
    async newMedia(id = newMediaId()) {
      await createMedia(db.database, { ...image, id });
      return id;
    },
    /** The device's writes reach the server: it has the media row and the unsent write is gone. */
    async sent(id: string) {
      bucket.server.add(id);
      await db.database.execute(
        "DELETE FROM ps_crud WHERE json_extract(data, '$.type') = 'media' AND json_extract(data, '$.id') = ?",
        [id],
      );
    },
    records: () =>
      db.database.getAll<{ id: string; state: number; size: number | null; timestamp: number }>(
        "SELECT id, state, size, timestamp FROM attachments ORDER BY id",
      ),
    async close() {
      await queue.stop().catch(() => undefined);
      await db.close();
      storage.cleanup();
    },
  };
  rigs.push(rig);
  return rig;
}

afterEach(async () => {
  for (const rig of rigs.splice(0)) await rig.close();
});

const started = (queue: MediaQueue) => queue.start();

describe("media queue across accounts", () => {
  it("does not bring the old account's file back when a download finishes after the wipe", async () => {
    const s = await setup({ hold: true });
    const a = await s.newMedia();
    await started(s.queue);
    // The thumbnail of A's media is being fetched: the GET is held.
    await eventually(() => s.bucket.held.length === 1);

    // The device is wiped for another account while that GET is in flight (the lifecycle stops
    // the queue, clears the database, then clears the queue's files).
    await s.queue.stop();
    await s.db.disconnectAndClear();
    await s.queue.clear();
    await claimDeviceOwner(s.db, "user-b");

    const b = await s.newMedia();
    s.bucket.holdDownloads(false);
    await started(s.queue);
    await eventually(async () =>
      (await s.records()).some((r) => r.id === `${b}_t` && r.state === AttachmentState.SYNCED),
    );

    // The old GET answers only now.
    s.bucket.held[0]?.release(10);
    await settle();

    expect(s.storage.files()).toEqual([`thumb/${b}_t.jpg`]);
    const ids = (await s.records()).map((r) => r.id);
    expect(ids).toEqual([`${b}_t`]);
    expect(ids).not.toContain(`${a}_t`);
  });

  it("stops without waiting for a transfer that never answers", async () => {
    const s = await setup({ hold: true });
    await s.newMedia();
    await started(s.queue);
    await eventually(() => s.bucket.held.length === 1);
    await Promise.race([
      s.queue.stop(),
      settle(3000).then(() => {
        throw new Error("stop() waited for the held transfer");
      }),
    ]);
  });

  it("keeps a cancelled transfer queued for the same account's next start", async () => {
    const s = await setup({ hold: true });
    const id = await s.newMedia();
    await started(s.queue);
    await eventually(() => s.bucket.held.length === 1);
    await s.queue.stop();
    expect((await s.records()).find((r) => r.id === `${id}_t`)?.state).toBe(
      AttachmentState.QUEUED_DOWNLOAD,
    );
    s.bucket.holdDownloads(false);
    await started(s.queue);
    await eventually(async () =>
      (await s.records()).some((r) => r.state === AttachmentState.SYNCED),
    );
  });
});

describe("media queue and the media row", () => {
  it("keeps staged uploads until the media row exists, then uploads them", async () => {
    const s = await setup();
    const id = newMediaId();
    const files = writePickedFiles(`${s.storage.root}/picked`, "one", { full: 100, thumb: 10 });
    // Files are saved; the media transaction has not happened (yet, or ever).
    await s.queue.addFiles(id, files);
    await started(s.queue);
    await settle(300);

    expect(s.bucket.signedUploads).toEqual([]);
    expect(s.storage.files()).toEqual([`full/${id}.jpg`, `thumb/${id}_t.jpg`]);
    expect((await s.records()).map((r) => r.state)).toEqual([
      AttachmentState.QUEUED_UPLOAD,
      AttachmentState.QUEUED_UPLOAD,
    ]);

    // The transaction commits, but the row's write has not been sent: nothing is signed yet.
    await createMedia(s.db, { ...image, id });
    await settle(300);
    expect(s.bucket.signedUploads).toEqual([]);
    expect((await s.records()).map((r) => r.state)).toEqual([
      AttachmentState.QUEUED_UPLOAD,
      AttachmentState.QUEUED_UPLOAD,
    ]);
    expect(s.queue.failures.has(`${id}`)).toBe(false);

    // The device's writes reach the server, which now has the row.
    await s.sent(id);
    await eventually(async () =>
      (await s.records()).every((r) => r.state === AttachmentState.SYNCED),
    );
    expect(s.bucket.puts.sort()).toEqual([`${id}/full`, `${id}/thumb`]);
    expect(s.storage.files()).toEqual([`full/${id}.jpg`, `thumb/${id}_t.jpg`]);
  });

  it("drops staged files whose media row never came, once they are old", async () => {
    const s = await setup();
    const id = newMediaId();
    const files = writePickedFiles(`${s.storage.root}/picked`, "two", { full: 100, thumb: 10 });
    await s.queue.addFiles(id, files);
    await s.db.execute("UPDATE attachments SET timestamp = ?", [Date.now() - 60 * 60 * 1000]);
    await started(s.queue);
    await eventually(async () => (await s.records()).length === 0);
    expect(s.storage.files()).toEqual([]);
  });

  it("drops the files of a media deleted while its upload was queued", async () => {
    const s = await setup();
    const id = await s.newMedia();
    const files = writePickedFiles(`${s.storage.root}/picked`, "three", { full: 100, thumb: 10 });
    await s.queue.addFiles(id, files);
    await deleteMedia(s.db, id);
    await s.queue.discard(id);
    await started(s.queue);
    await settle(200);
    expect(s.storage.files()).toEqual([]);
    expect(await s.records()).toEqual([]);
  });
});

describe("media queue full-size cache", () => {
  it("counts downloaded full images and evicts the least recently opened beyond the cap", async () => {
    const s = await setup({ fullCacheBytes: 250 });
    const ids = [await s.newMedia(), await s.newMedia(), await s.newMedia()];
    await started(s.queue);
    for (const id of ids) {
      await s.queue.wantFull(id);
      await eventually(async () =>
        (await s.records()).some((r) => r.id === id && r.state === AttachmentState.SYNCED),
      );
      // Opening order is recency order.
      await settle(5);
    }
    // 3 x 100 bytes is over 250: the first one opened goes, its file with it.
    await eventually(() => !s.storage.files().includes(`full/${ids[0]}.jpg`));
    expect(
      s.storage
        .files()
        .filter((file) => file.startsWith("full/"))
        .sort(),
    ).toEqual([`full/${ids[1]}.jpg`, `full/${ids[2]}.jpg`].sort());
    const kept = (await s.records()).filter(
      (r) => r.state === AttachmentState.SYNCED && !r.id.endsWith("_t"),
    );
    expect(kept.map((r) => r.size)).toEqual([100, 100]);
  });

  it("trims after uploads complete too", async () => {
    const s = await setup({ fullCacheBytes: 250 });
    await started(s.queue);
    const ids: string[] = [];
    for (const name of ["u1", "u2", "u3"]) {
      const id = newMediaId();
      ids.push(id);
      await s.queue.addFiles(
        id,
        writePickedFiles(`${s.storage.root}/picked`, name, { full: 100, thumb: 10 }),
      );
      await createMedia(s.db, { ...image, id });
      await s.sent(id);
      await eventually(() => s.bucket.puts.includes(`${id}/full`));
      await settle(5);
    }
    await eventually(
      () => s.storage.files().filter((file) => file.startsWith("full/")).length === 2,
    );
    expect(s.storage.files().includes(`full/${ids[0]}.jpg`)).toBe(false);
  });
});
