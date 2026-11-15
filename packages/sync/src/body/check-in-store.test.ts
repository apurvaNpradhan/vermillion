import { describe, expect, it } from "vitest";

import { claimDeviceOwner } from "../platform/device-owner";
import { createFakeDatabase } from "../platform/fake-database";
import { newMediaId, type MediaDatabase } from "../media";
import { saveCheckIn } from "./check-in-store";

async function setup() {
  const fake = createFakeDatabase();
  await claimDeviceOwner(fake.database, "owner");
  // Safety: the fake implements the database methods the store calls.
  const database = fake.database as never as MediaDatabase;
  const rows = (table: string) => fake.sqlite.prepare(`SELECT * FROM ${table}`).all();
  return { ...fake, database, rows };
}

const day = { local_date: "2026-01-01", taken_at: "2026-01-01T08:00:00Z" };
const measurement = (metric: "weight" | "waist", value: number) => ({
  metric,
  value,
  measured_at: "2026-01-01T08:00:00.000Z",
  local_date: "2026-01-01",
  source: "manual" as const,
});
const image = () => ({
  id: newMediaId(),
  width: 1536,
  height: 2048,
  bytes: 400_000,
  thumbBytes: 30_000,
});

describe("saving a Check-in", () => {
  it("writes the measurements, the media and the photos together", async () => {
    const s = await setup();
    const front = image();
    const side = image();
    const result = await saveCheckIn(s.database, {
      measurements: [measurement("weight", 80), measurement("waist", 90)],
      photos: [
        { pose: "front", ...day, media: front },
        { pose: "side", ...day, media: side },
      ],
    });
    expect(result.measurementIds).toHaveLength(2);
    expect(result.photoIds).toHaveLength(2);
    expect(s.rows("body_measurement")).toHaveLength(2);
    expect(s.rows("media").map((row) => (row as { id: string }).id)).toEqual(
      expect.arrayContaining([front.id, side.id]),
    );
    expect(s.rows("progress_photo")).toHaveLength(2);
  });

  it("commits nothing when a later photo is refused", async () => {
    const s = await setup();
    await expect(
      saveCheckIn(s.database, {
        measurements: [measurement("weight", 80)],
        photos: [
          { pose: "front", ...day, media: image() },
          { pose: "side", ...day, media: { ...image(), bytes: 0 } },
        ],
      }),
    ).rejects.toThrow();
    expect(s.rows("body_measurement")).toEqual([]);
    expect(s.rows("media")).toEqual([]);
    expect(s.rows("progress_photo")).toEqual([]);
  });

  it("commits nothing when a measurement is refused", async () => {
    const s = await setup();
    await expect(
      saveCheckIn(s.database, {
        measurements: [measurement("weight", 80), measurement("waist", -1)],
        photos: [{ pose: "front", ...day, media: image() }],
      }),
    ).rejects.toThrow();
    expect(s.rows("body_measurement")).toEqual([]);
    expect(s.rows("media")).toEqual([]);
    expect(s.rows("progress_photo")).toEqual([]);
  });

  it("refuses a changed account before writing anything", async () => {
    const s = await setup();
    await expect(
      saveCheckIn(
        s.database,
        { measurements: [measurement("weight", 80)], photos: [] },
        "not-this-install",
      ),
    ).rejects.toThrow();
    expect(s.rows("body_measurement")).toEqual([]);
  });
});
