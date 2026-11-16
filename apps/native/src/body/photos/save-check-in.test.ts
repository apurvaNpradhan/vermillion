import { existsSync, rmSync, copyFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";

import { createMediaQueue } from "../../media/queue/attachment-queue";
import {
  createDiskStorage,
  createFakeBucket,
  createTestDatabase,
  writePickedFiles,
} from "../../media/queue/test-kit";
import type { ProcessedImage } from "@/media";

import { saveCheckInWithPhotos, type CheckInFiles } from "./save-check-in";

const cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

const SCOPE = "install-1";
const day = { takenAt: "2026-01-01T08:00:00Z", localDate: "2026-01-01" };
const measurement = (value: number) => ({
  metric: "weight" as const,
  value,
  measured_at: "2026-01-01T08:00:00.000Z",
  local_date: "2026-01-01",
  source: "manual" as const,
});

async function setup() {
  const db = await createTestDatabase();
  const storage = createDiskStorage();
  const bucket = createFakeBucket();
  const queue = createMediaQueue(db.database, bucket.urls, bucket.send, storage);
  cleanups.push(
    () => db.close(),
    () => storage.cleanup(),
  );
  await db.database.execute(
    "INSERT INTO install_meta (id, install_id, created_at) VALUES ('meta', ?, 'now')",
    [SCOPE],
  );
  let copies = 0;
  const files: CheckInFiles = {
    clone(image) {
      copies += 1;
      const fullUri = `${storage.root}/picked/clone-${copies}.jpg`;
      const thumbUri = `${storage.root}/picked/clone-${copies}_t.jpg`;
      copyFileSync(image.fullUri, fullUri);
      copyFileSync(image.thumbUri, thumbUri);
      return { ...image, fullUri, thumbUri };
    },
    discard(image) {
      rmSync(image.fullUri, { force: true });
      rmSync(image.thumbUri, { force: true });
    },
  };
  const picked = (name: string, overrides: Partial<ProcessedImage> = {}): ProcessedImage => ({
    ...writePickedFiles(`${storage.root}/picked`, name, { full: 100, thumb: 10 }),
    width: 1536,
    height: 2048,
    bytes: 100,
    thumbBytes: 10,
    ...overrides,
  });
  const count = async (table: string) =>
    (await db.database.getAll(`SELECT id FROM ${table}`)).length;
  return { db: db.database, storage, queue, files, picked, count };
}

describe("saving a Check-in with photos", () => {
  it("writes the measurements, media and photos, and consumes the picked files", async () => {
    const s = await setup();
    const front = s.picked("front");
    const side = s.picked("side");
    await saveCheckInWithPhotos({
      database: s.db,
      queue: s.queue,
      files: s.files,
      scope: SCOPE,
      measurements: [measurement(80)],
      photos: { front, side },
      ...day,
    });
    expect(await s.count("body_measurement")).toBe(1);
    expect(await s.count("media")).toBe(2);
    expect(await s.count("progress_photo")).toBe(2);
    expect(s.storage.files()).toHaveLength(4);
    // The picked originals were processed pictures nobody needs any more.
    expect(existsSync(front.fullUri) || existsSync(side.thumbUri)).toBe(false);
  });

  it("commits nothing when one photo cannot be written, and keeps the pictures for a retry", async () => {
    const s = await setup();
    const front = s.picked("front");
    const side = s.picked("side", { bytes: 0 });
    await expect(
      saveCheckInWithPhotos({
        database: s.db,
        queue: s.queue,
        files: s.files,
        scope: SCOPE,
        measurements: [measurement(80)],
        photos: { front, side },
        ...day,
      }),
    ).rejects.toThrow();
    expect(await s.count("body_measurement")).toBe(0);
    expect(await s.count("media")).toBe(0);
    expect(await s.count("progress_photo")).toBe(0);
    // Nothing is left in the queue, and the pending pictures are whole.
    expect(s.storage.files()).toEqual([]);
    expect(await s.count("attachments")).toBe(0);
    expect(existsSync(front.fullUri)).toBe(true);
    expect(existsSync(side.thumbUri)).toBe(true);
  });

  it("can be tried again after a failure", async () => {
    const s = await setup();
    const front = s.picked("front");
    const args = {
      database: s.db,
      queue: s.queue,
      files: s.files,
      measurements: [measurement(80)],
      photos: { front },
      ...day,
    };
    await expect(saveCheckInWithPhotos({ ...args, scope: "wrong-install" })).rejects.toThrow();
    expect(await s.count("body_measurement")).toBe(0);
    expect(existsSync(front.fullUri)).toBe(true);
    await saveCheckInWithPhotos({ ...args, scope: SCOPE });
    expect(await s.count("body_measurement")).toBe(1);
    expect(await s.count("progress_photo")).toBe(1);
  });

  it("drops the staged copies when the file copy itself fails midway", async () => {
    const s = await setup();
    const front = s.picked("front");
    const side = s.picked("side");
    let calls = 0;
    const files: CheckInFiles = {
      ...s.files,
      clone(image) {
        calls += 1;
        if (calls === 2) throw new Error("No space left");
        return s.files.clone(image);
      },
    };
    await expect(
      saveCheckInWithPhotos({
        database: s.db,
        queue: s.queue,
        files,
        scope: SCOPE,
        measurements: [measurement(80)],
        photos: { front, side },
        ...day,
      }),
    ).rejects.toThrow("No space left");
    expect(await s.count("body_measurement")).toBe(0);
    expect(s.storage.files()).toEqual([]);
    expect(existsSync(front.fullUri)).toBe(true);
  });
});
