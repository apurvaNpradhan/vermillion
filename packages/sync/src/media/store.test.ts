import { describe, expect, it } from "vitest";

import { claimDeviceOwner } from "../platform/device-owner";
import { createFakeDatabase } from "../platform/fake-database";
import { ensureInstallId } from "../platform/install-meta";
import {
  createMedia,
  deleteMedia,
  mediaUploadColumns,
  newMediaId,
  type MediaDatabase,
} from "./index";

const image = {
  kind: "avatar",
  width: 512,
  height: 512,
  bytes: 40_000,
  thumbBytes: 6_000,
} as const;

async function setup() {
  const fake = createFakeDatabase();
  await claimDeviceOwner(fake.database, "owner");
  // Safety: the fake implements the database methods the store calls.
  const database = fake.database as never as MediaDatabase;
  const rows = () => fake.sqlite.prepare("SELECT * FROM media ORDER BY id").all();
  return { ...fake, database, rows };
}

describe("media store", () => {
  it("creates a row for the Device owner with a UUIDv7 and the processed image's facts", async () => {
    const s = await setup();
    const id = await createMedia(s.database, image);
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-/);
    expect(s.rows()).toEqual([
      expect.objectContaining({
        id,
        user_id: "owner",
        kind: "avatar",
        mime: "image/jpeg",
        width: 512,
        height: 512,
        bytes: 40_000,
        thumb_bytes: 6_000,
      }),
    ]);
  });

  it("uses an id made before the files were named after it", async () => {
    const s = await setup();
    const id = newMediaId();
    expect(await createMedia(s.database, { ...image, id })).toBe(id);
    expect(s.rows()).toHaveLength(1);
  });

  it("refuses what the server refuses, and writes nothing", async () => {
    const s = await setup();
    for (const bad of [
      { width: 0 },
      { height: 3000 },
      { bytes: 0 },
      { bytes: 16 * 1024 * 1024 },
      { thumbBytes: 0 },
      { kind: "video" },
    ]) {
      // @ts-expect-error the cases include values the types refuse
      await expect(createMedia(s.database, { ...image, ...bad })).rejects.toThrow();
    }
    expect(s.rows()).toHaveLength(0);
  });

  it("refuses a missing Device owner and a stale install", async () => {
    const bare = createFakeDatabase();
    await expect(
      // Safety: the fake implements the database methods the store calls.
      createMedia(bare.database as never as MediaDatabase, image),
    ).rejects.toThrow("Device owner");
    const s = await setup();
    const installId = await ensureInstallId(s.database);
    await expect(createMedia(s.database, image, installId)).resolves.toEqual(expect.any(String));
    await expect(createMedia(s.database, image, "another")).rejects.toThrow(
      "device account changed",
    );
  });

  it("deletes a row, and says so only once", async () => {
    const s = await setup();
    const id = await createMedia(s.database, image);
    expect(await deleteMedia(s.database, id)).toBe(true);
    expect(await deleteMedia(s.database, id)).toBe(false);
    expect(s.rows()).toHaveLength(0);
  });

  it("uploads only what the server's media handler accepts", () => {
    expect([...mediaUploadColumns].toSorted()).toEqual([
      "bytes",
      "height",
      "kind",
      "mime",
      "thumb_bytes",
      "width",
    ]);
  });
});
