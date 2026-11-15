import { createProgram, setProgramCoverToNewMedia, newMediaId } from "@workspace/sync";
import { afterEach, describe, expect, it } from "vitest";

import { createMediaQueue } from "./attachment-queue";
import { saveWithMedia } from "./save-with-media";
import {
  createDiskStorage,
  createFakeBucket,
  createTestDatabase,
  writePickedFiles,
} from "./test-kit";

const image = { width: 1024, height: 1024, bytes: 100, thumbBytes: 10 };

const cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function setup(options: { failDeleteOf?: (uri: string) => boolean } = {}) {
  const db = await createTestDatabase();
  const storage = createDiskStorage(options);
  const bucket = createFakeBucket();
  const queue = createMediaQueue(db.database, bucket.urls, bucket.send, storage);
  cleanups.push(
    () => db.close(),
    () => storage.cleanup(),
  );
  const programId = await createProgram(db.database, {
    title: "Covered",
    description: null,
    planned_weeks: null,
  });
  /** Picks a cover: files, then the media row and the reference in one transaction. */
  const pickCover = (
    name: string,
    commit?: (id: string) => Promise<{ replaced: string | null } | null>,
  ) => {
    const id = newMediaId();
    const files = writePickedFiles(`${storage.root}/picked`, name, { full: 100, thumb: 10 });
    const saved = saveWithMedia(queue, files, id, () =>
      commit ? commit(id) : setProgramCoverToNewMedia(db.database, programId, { ...image, id }),
    );
    return { id, saved };
  };
  const mediaIds = async () =>
    (await db.database.getAll<{ id: string }>("SELECT id FROM media ORDER BY id")).map((r) => r.id);
  return { db: db.database, storage, queue, programId, pickCover, mediaIds };
}

describe("saving a new media with what points at it", () => {
  it("keeps the new cover when the old cover's files cannot be deleted", async () => {
    let failing = false;
    const s = await setup({ failDeleteOf: () => failing });
    const first = s.pickCover("first");
    expect(await first.saved).toBe(true);

    // Replacing it commits; then dropping the old files fails.
    failing = true;
    const second = s.pickCover("second");
    expect(await second.saved).toBe(true);

    expect(await s.mediaIds()).toEqual([second.id]);
    expect(s.storage.files()).toContain(`full/${second.id}.jpg`);
    expect(s.storage.files()).toContain(`thumb/${second.id}_t.jpg`);
    const records = await s.db.getAll<{ id: string }>("SELECT id FROM attachments");
    expect(records.map((r) => r.id)).toEqual(expect.arrayContaining([second.id, `${second.id}_t`]));
  });

  it("discards the new files when the write fails before it commits", async () => {
    const s = await setup();
    const failed = s.pickCover("failed", async () => {
      throw new Error("The Program is gone");
    });
    await expect(failed.saved).rejects.toThrow("The Program is gone");
    expect(await s.mediaIds()).toEqual([]);
    expect(s.storage.files()).toEqual([]);
  });

  it("discards the new files when the write was refused", async () => {
    const s = await setup();
    const refused = s.pickCover("refused", async () => null);
    expect(await refused.saved).toBe(false);
    expect(s.storage.files()).toEqual([]);
    expect(await s.db.getAll("SELECT id FROM attachments")).toEqual([]);
  });
});
