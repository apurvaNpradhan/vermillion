import { describe, expect, it } from "vitest";

import { claimDeviceOwner } from "../platform/device-owner";
import { createFakeDatabase } from "../platform/fake-database";
import { newMediaId, type MediaDatabase } from "../media";
import { addProgressPhoto, deleteProgressPhoto } from "./photo-store";

async function setup() {
  const fake = createFakeDatabase();
  await claimDeviceOwner(fake.database, "owner");
  // Safety: the fake implements the database methods the store calls.
  const database = fake.database as never as MediaDatabase;
  const media = () => fake.sqlite.prepare("SELECT * FROM media ORDER BY id").all();
  const photos = () => fake.sqlite.prepare("SELECT * FROM progress_photo ORDER BY id").all();
  return { ...fake, database, media, photos };
}

const image = () => ({
  id: newMediaId(),
  width: 1536,
  height: 2048,
  bytes: 400_000,
  thumbBytes: 30_000,
});
const day = { local_date: "2026-01-01", taken_at: "2026-01-01T08:00:00Z" };

describe("progress photo store", () => {
  it("writes the media and the photo that points at it for the Device owner", async () => {
    const s = await setup();
    const media = image();
    const id = await addProgressPhoto(s.database, { pose: "front", ...day, media });
    expect(s.media()).toEqual([
      expect.objectContaining({ id: media.id, user_id: "owner", kind: "progress_photo" }),
    ]);
    expect(s.photos()).toEqual([
      expect.objectContaining({
        id,
        user_id: "owner",
        media_id: media.id,
        pose: "front",
        local_date: "2026-01-01",
      }),
    ]);
  });

  it("writes both or neither: a bad photo leaves no media row behind", async () => {
    const s = await setup();
    await expect(
      addProgressPhoto(s.database, {
        pose: "front",
        local_date: "2099-01-01",
        taken_at: "2099-01-01T08:00:00Z",
        media: image(),
      }),
    ).rejects.toThrow();
    expect(s.media()).toEqual([]);
    expect(s.photos()).toEqual([]);
  });

  it("deletes a photo with its media and reports the media to drop files for", async () => {
    const s = await setup();
    const media = image();
    const id = await addProgressPhoto(s.database, { pose: "back", ...day, media });
    expect(await deleteProgressPhoto(s.database, id)).toBe(media.id);
    expect(s.media()).toEqual([]);
    expect(s.photos()).toEqual([]);
    expect(await deleteProgressPhoto(s.database, id)).toBeNull();
  });

  it("keeps other photos when one is deleted", async () => {
    const s = await setup();
    const a = await addProgressPhoto(s.database, { pose: "front", ...day, media: image() });
    await addProgressPhoto(s.database, { pose: "side", ...day, media: image() });
    await deleteProgressPhoto(s.database, a);
    expect(s.photos()).toHaveLength(1);
    expect(s.media()).toHaveLength(1);
  });
});
