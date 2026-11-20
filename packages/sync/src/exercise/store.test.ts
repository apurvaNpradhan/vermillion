import { setExerciseImage } from "./image-store";
import type { CustomExerciseInput } from "@workspace/shared";
import { describe, expect, it } from "vitest";

import { claimDeviceOwner } from "../platform/device-owner";
import { createFakeDatabase } from "../platform/fake-database";
import { ensureInstallId } from "../platform/install-meta";
import {
  archiveExercise,
  createCustomExercise,
  restoreExercise,
  updateCustomExercise,
  type ExerciseDatabase,
} from "./store";

const input: CustomExerciseInput = {
  title: "My press",
  primary_muscle: "chest",
  secondary_muscles: ["triceps"],
  primary_detail: ["upper_chest"],
  secondary_detail: [],
  equipment: "dumbbell",
  exercise_type: "weight_reps",
  is_full_bodyweight: false,
  instructions: null,
};

async function setup() {
  const fake = createFakeDatabase();
  await claimDeviceOwner(fake.database, "owner");
  // Safety: the fake implements the database methods the store calls.
  return { ...fake, exercises: fake.database as never as ExerciseDatabase };
}

const row = (s: Awaited<ReturnType<typeof setup>>, id: string) =>
  s.sqlite.prepare("SELECT * FROM exercise WHERE id = ?").get(id);

describe("exercise store", () => {
  it("replaces an image in one transaction and removes its previous media", async () => {
    const s = await setup();
    const id = await createCustomExercise(s.exercises, input);
    const image = { width: 512, height: 512, bytes: 1000, thumbBytes: 100 };
    expect(await setExerciseImage(s.exercises, id, image)).toBeNull();
    const first = row(s, id)?.image_media_id;
    expect(first).toBeTypeOf("string");
    expect(await setExerciseImage(s.exercises, id, image)).toBe(first);
    expect(s.sqlite.prepare("SELECT * FROM media").all()).toHaveLength(1);
    expect(await updateCustomExercise(s.exercises, id, { image_media_id: null })).toBe(true);
    expect(row(s, id)?.image_media_id).toBeNull();
    expect(s.sqlite.prepare("SELECT * FROM media").all()).toHaveLength(0);
  });

  it("creates a Custom exercise for the Device owner with arrays as JSON text", async () => {
    const s = await setup();
    const id = await createCustomExercise(s.exercises, input);
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(row(s, id)).toMatchObject({
      user_id: "owner",
      title: "My press",
      secondary_muscles: '["triceps"]',
      is_full_bodyweight: 0,
      retired_at: null,
    });
  });

  it("refuses invalid input and a missing Device owner", async () => {
    const s = await setup();
    await expect(createCustomExercise(s.exercises, { ...input, title: " " })).rejects.toThrow();
    await expect(
      createCustomExercise(s.exercises, { ...input, secondary_muscles: ["chest"] }),
    ).rejects.toThrow();
    const bare = createFakeDatabase();
    await expect(
      createCustomExercise(bare.database as never as ExerciseDatabase, input),
    ).rejects.toThrow("Device owner");
  });

  it("updates only the fields that changed", async () => {
    const s = await setup();
    const id = await createCustomExercise(s.exercises, input);
    const before = row(s, id);
    expect(await updateCustomExercise(s.exercises, id, { title: "My press" })).toBe(false);
    expect(row(s, id)).toEqual(before);
    expect(await updateCustomExercise(s.exercises, id, { equipment: "barbell" })).toBe(true);
    expect(row(s, id)).toMatchObject({ equipment: "barbell", title: "My press" });
    await expect(
      updateCustomExercise(s.exercises, id, { secondary_muscles: ["chest"] }),
    ).rejects.toThrow();
  });

  it("stores details as JSON text and validates them against the groups", async () => {
    const s = await setup();
    const id = await createCustomExercise(s.exercises, {
      ...input,
      secondary_muscles: ["shoulders"],
      secondary_detail: ["rear_delts"],
    });
    expect(row(s, id)).toMatchObject({
      primary_detail: '["upper_chest"]',
      secondary_detail: '["rear_delts"]',
    });
    expect(await updateCustomExercise(s.exercises, id, { primary_detail: ["lower_chest"] })).toBe(
      true,
    );
    expect(row(s, id)?.primary_detail).toBe('["lower_chest"]');
    await expect(
      updateCustomExercise(s.exercises, id, { primary_detail: ["side_delts"] }),
    ).rejects.toThrow();
    await expect(
      createCustomExercise(s.exercises, { ...input, primary_detail: ["obliques"] }),
    ).rejects.toThrow();
  });

  it("edits a row that holds a detail slug this build does not know", async () => {
    const s = await setup();
    const id = await createCustomExercise(s.exercises, {
      ...input,
      secondary_muscles: ["shoulders"],
    });
    // A newer build stored a detail slug this one has no entry for, next to a known one.
    s.sqlite
      .prepare("UPDATE exercise SET primary_detail = ?, secondary_detail = ? WHERE id = ?")
      .run('["upper_chest","future_chest_part"]', '["rear_delts","future_delt"]', id);

    // Another field changes: it must not fail, and the stored details are not touched.
    expect(await updateCustomExercise(s.exercises, id, { title: "Renamed" })).toBe(true);
    expect(row(s, id)).toMatchObject({
      title: "Renamed",
      primary_detail: '["upper_chest","future_chest_part"]',
      secondary_detail: '["rear_delts","future_delt"]',
    });

    // The form hands back the known part unchanged: nothing to write.
    expect(
      await updateCustomExercise(s.exercises, id, {
        primary_detail: ["upper_chest"],
        secondary_detail: ["rear_delts"],
      }),
    ).toBe(false);

    // A real details change writes known slugs only; the unknown one is never sent back.
    expect(await updateCustomExercise(s.exercises, id, { primary_detail: ["lower_chest"] })).toBe(
      true,
    );
    expect(row(s, id)).toMatchObject({
      primary_detail: '["lower_chest"]',
      secondary_detail: '["rear_delts","future_delt"]',
    });
  });

  it("drops an unplaceable unknown slug when the muscle groups change", async () => {
    const s = await setup();
    const id = await createCustomExercise(s.exercises, input);
    s.sqlite
      .prepare("UPDATE exercise SET primary_detail = ? WHERE id = ?")
      .run('["upper_chest","future_chest_part"]', id);
    expect(await updateCustomExercise(s.exercises, id, { secondary_muscles: ["biceps"] })).toBe(
      true,
    );
    expect(row(s, id)).toMatchObject({
      secondary_muscles: '["biceps"]',
      primary_detail: '["upper_chest"]',
    });
  });

  it("never writes a catalog row", async () => {
    const s = await setup();
    s.sqlite
      .prepare(
        `INSERT INTO exercise (id, user_id, title, primary_muscle, secondary_muscles, equipment,
           exercise_type, is_full_bodyweight, created_at)
         VALUES ('cat', NULL, 'Catalog', 'chest', '[]', 'none', 'reps_only', 0, 'now')`,
      )
      .run();
    expect(await updateCustomExercise(s.exercises, "cat", { title: "Nope" })).toBe(false);
    expect(await archiveExercise(s.exercises, "cat")).toBe(false);
    expect(row(s, "cat")).toMatchObject({ title: "Catalog", retired_at: null });
  });

  it("archives and restores, never deleting", async () => {
    const s = await setup();
    const id = await createCustomExercise(s.exercises, input);
    expect(await archiveExercise(s.exercises, id)).toBe(true);
    expect(row(s, id)?.["retired_at"]).toEqual(expect.any(String));
    expect(await restoreExercise(s.exercises, id)).toBe(true);
    expect(row(s, id)?.["retired_at"]).toBeNull();
  });

  it("refuses a write after the device account changed", async () => {
    const s = await setup();
    const installId = await ensureInstallId(s.database);
    await expect(createCustomExercise(s.exercises, input, installId)).resolves.toEqual(
      expect.any(String),
    );
    await expect(createCustomExercise(s.exercises, input, "another-install")).rejects.toThrow(
      "device account changed",
    );
  });
});
