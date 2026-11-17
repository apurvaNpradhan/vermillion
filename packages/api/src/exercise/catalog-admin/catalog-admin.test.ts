import { uuidv7 } from "@workspace/db/columns";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createFullAdmin, fakeNetwork } from "../../platform/testing/admin";
import { createSignedInUser, createTestApp, type TestApp } from "../../platform/testing/harness";
import { parseCatalog } from "../catalog-file";
import { bundledCatalogText } from "../operations/bundled-catalog";
import { seedCatalog } from "../operations/seed-catalog";

const ADMIN = "owner@example.com";
const THUMB = "exercises/admin/new-thumbnail-1.jpg";
const VIDEO = "exercises/admin/new-video-1.mp4";

const fields = (title: string) => ({
  title,
  primaryMuscle: "chest" as const,
  secondaryMuscles: ["triceps" as const],
  equipment: "dumbbell" as const,
  exerciseType: "weight_reps" as const,
  isFullBodyweight: false,
  aka: "db press",
  searchTerms: null,
  instructions: "Press.",
  rank: 3,
});

let app: TestApp;
let admin: ReturnType<TestApp["client"]>;

beforeAll(async () => {
  app = await createTestApp({
    config: { adminEmails: [ADMIN] },
    fetch: fakeNetwork({ objects: new Set([THUMB, VIDEO]) }).fetch,
  });
  await seedCatalog(app.services.db, bundledCatalogText());
  admin = app.client((await createFullAdmin(app, ADMIN)).headers);
}, 60_000);
afterAll(async () => app?.close());

async function rejection(call: Promise<object>) {
  return call.then(
    () => {
      throw new Error("expected a failure");
    },
    (error: Error) => error,
  );
}

describe("admin catalog", () => {
  it("creates a live exercise with a server id and bumps it into the catalog stream", async () => {
    const before = new Date();
    const created = await admin.admin.catalog.create({
      exercise: fields("Admin Press (Dumbbell)"),
      thumbnailKey: THUMB,
      videoKey: VIDEO,
    });
    expect(created).toMatchObject({ title: "Admin Press (Dumbbell)", retired: false });
    expect(created.thumbnailUrl).toBe(`http://127.0.0.1:9000/vermillion-exercise-media/${THUMB}`);
    const [row] = await app.rows(
      sql`SELECT user_id, updated_at FROM exercise WHERE id = ${created.id}`,
    );
    expect(row?.user_id).toBeNull();
    expect(new Date(String(row?.updated_at)).getTime()).toBeGreaterThanOrEqual(
      before.getTime() - 1000,
    );
  });

  it("needs an uploaded thumbnail for a live exercise, but not for a retired one", async () => {
    expect(
      await rejection(admin.admin.catalog.create({ exercise: fields("No Thumb (Dumbbell)") })),
    ).toMatchObject({ code: "BAD_REQUEST", data: { code: "CATALOG_THUMBNAIL_REQUIRED" } });
    expect(
      await rejection(
        admin.admin.catalog.create({
          exercise: fields("Missing Upload (Dumbbell)"),
          thumbnailKey: "exercises/admin/new-thumbnail-never-uploaded.jpg",
        }),
      ),
    ).toMatchObject({ data: { code: "CATALOG_MEDIA_MISSING" } });
    const retired = await admin.admin.catalog.create({
      exercise: fields("Draft Press (Dumbbell)"),
      retired: true,
    });
    expect(retired.retired).toBe(true);
    expect(await rejection(admin.admin.catalog.restore({ id: retired.id }))).toMatchObject({
      data: { code: "CATALOG_THUMBNAIL_REQUIRED" },
    });
  });

  it("refuses a title another live catalog exercise has, in any case", async () => {
    const [existing] = await app.rows(
      sql`SELECT title FROM exercise WHERE user_id IS NULL AND retired_at IS NULL LIMIT 1`,
    );
    const taken = String(existing?.title).toUpperCase();
    expect(
      await rejection(admin.admin.catalog.create({ exercise: fields(taken), thumbnailKey: THUMB })),
    ).toMatchObject({ code: "CONFLICT", data: { code: "CATALOG_TITLE_TAKEN" } });
  });

  it("refuses unknown slugs", async () => {
    const bad = { ...fields("Odd (Dumbbell)"), equipment: "spaceship" };
    // @ts-expect-error an unknown equipment slug
    const call = admin.admin.catalog.create({ exercise: bad, thumbnailKey: THUMB });
    expect(await rejection(call)).toMatchObject({ code: "BAD_REQUEST" });
  });

  it("edits fields, never touches a Custom exercise, and locks the type once a set exists", async () => {
    const created = await admin.admin.catalog.create({
      exercise: fields("Lockable Press (Dumbbell)"),
      thumbnailKey: THUMB,
    });
    const updated = await admin.admin.catalog.update({
      id: created.id,
      patch: { title: "Lockable Press (Dumbbells)", exerciseType: "duration" },
    });
    expect(updated).toMatchObject({
      title: "Lockable Press (Dumbbells)",
      exerciseType: "duration",
    });

    // A Custom exercise is invisible to the catalog procedures.
    await createSignedInUser(app, "lifter@example.com", "Lifter");
    const [lifter] = await app.rows(sql`SELECT id FROM "user" WHERE email = 'lifter@example.com'`);
    const customId = uuidv7();
    await app.rows(sql`
      INSERT INTO exercise (id, user_id, title, primary_muscle, equipment, exercise_type)
      VALUES (${customId}, ${String(lifter?.id)}, 'My Press', 'chest', 'dumbbell', 'weight_reps')
      RETURNING id`);
    expect(
      await rejection(admin.admin.catalog.update({ id: customId, patch: { rank: 1 } })),
    ).toMatchObject({ code: "NOT_FOUND" });
    expect(await rejection(admin.admin.catalog.retire({ id: customId }))).toMatchObject({
      code: "NOT_FOUND",
    });

    // A Logged set fixes the type.
    const sessionId = uuidv7();
    const sessionExerciseId = uuidv7();
    await app.rows(sql`
      INSERT INTO training_session (id, user_id, title, started_at, device_id)
      VALUES (${sessionId}, ${String(lifter?.id)}, 'Push', now(), ${uuidv7()}) RETURNING id`);
    await app.rows(sql`
      INSERT INTO session_exercise (id, user_id, session_id, exercise_id, exercise_title, exercise_type, position)
      VALUES (${sessionExerciseId}, ${String(lifter?.id)}, ${sessionId}, ${created.id}, 'x', 'duration', 'a')
      RETURNING id`);
    await app.rows(sql`
      INSERT INTO session_set (id, user_id, session_exercise_id, position, kind)
      VALUES (${uuidv7()}, ${String(lifter?.id)}, ${sessionExerciseId}, 'a', 'working') RETURNING id`);
    expect((await admin.admin.catalog.get({ id: created.id })).typeLocked).toBe(true);
    expect(
      await rejection(
        admin.admin.catalog.update({ id: created.id, patch: { exerciseType: "weight_reps" } }),
      ),
    ).toMatchObject({ code: "CONFLICT", data: { code: "EXERCISE_TYPE_LOCKED" } });
    // Other fields still change.
    await admin.admin.catalog.update({ id: created.id, patch: { rank: 9 } });
  });

  it("retires and restores without deleting, and the list filters by state", async () => {
    const created = await admin.admin.catalog.create({
      exercise: fields("Retiree Press (Dumbbell)"),
      thumbnailKey: THUMB,
    });
    await admin.admin.catalog.retire({ id: created.id });
    const retired = await admin.admin.catalog.list({ search: "Retiree", retired: "retired" });
    expect(retired.exercises.map((row) => row.id)).toEqual([created.id]);
    expect((await admin.admin.catalog.list({ search: "Retiree" })).total).toBe(0);
    const restored = await admin.admin.catalog.restore({ id: created.id });
    expect(restored.retired).toBe(false);
    const [row] = await app.rows(
      sql`SELECT count(*)::int AS n FROM exercise WHERE id = ${created.id}`,
    );
    expect(row?.n).toBe(1);
  });

  it("signs an upload for a thumbnail or a video with type and length", async () => {
    const signed = await admin.admin.catalog.mediaUploadUrl({
      slot: "video",
      contentType: "video/mp4",
      contentLength: 2048,
    });
    expect(signed.key).toMatch(/^exercises\/admin\/new-video-[0-9a-f]{12}\.mp4$/);
    expect(signed.headers).toEqual({ "Content-Type": "video/mp4", "Content-Length": "2048" });
    expect(
      await rejection(
        admin.admin.catalog.mediaUploadUrl({
          slot: "thumbnail",
          contentType: "image/jpeg",
          contentLength: 600 * 1024,
        }),
      ),
    ).toMatchObject({ code: "BAD_REQUEST" });
  });

  it("exports the catalog in the seed file's shape, which seeds an empty database the same", async () => {
    const exported = await admin.admin.catalog.export();
    const text = JSON.stringify(exported);
    const parsed = parseCatalog(text);
    expect(parsed.map((row) => row.id)).toEqual(parsed.map((row) => row.id).sort());
    expect(parsed.some((row) => row.title === "Admin Press (Dumbbell)")).toBe(true);

    const fresh = await createTestApp();
    try {
      expect(await seedCatalog(fresh.services.db, text)).toEqual({ seeded: exported.length });
      const [counts] = await fresh.rows(sql`
        SELECT count(*)::int AS n, count(*) FILTER (WHERE retired_at IS NOT NULL)::int AS retired
          FROM exercise WHERE user_id IS NULL`);
      expect(counts).toEqual({
        n: exported.length,
        retired: exported.filter((row) => row.retired).length,
      });
    } finally {
      await fresh.close();
    }
  });

  it("exports the untouched seed byte for byte", async () => {
    const fresh = await createTestApp({ config: { adminEmails: [ADMIN] } });
    try {
      await seedCatalog(fresh.services.db, bundledCatalogText());
      const client = fresh.client((await createFullAdmin(fresh, ADMIN)).headers);
      const exported = await client.admin.catalog.export();
      expect(JSON.stringify(exported)).toBe(JSON.stringify(JSON.parse(bundledCatalogText())));
    } finally {
      await fresh.close();
    }
  });
});

describe("catalog seed", () => {
  it("seeds an empty table, then does nothing, even after an admin edit", async () => {
    const fresh = await createTestApp({ config: { adminEmails: [ADMIN] } });
    try {
      expect(await seedCatalog(fresh.services.db, bundledCatalogText())).toEqual({ seeded: 455 });
      const client = fresh.client((await createFullAdmin(fresh, ADMIN)).headers);
      const [first] = await fresh.rows(
        sql`SELECT id FROM exercise WHERE user_id IS NULL AND retired_at IS NULL ORDER BY id LIMIT 1`,
      );
      const id = String(first?.id);
      await client.admin.catalog.update({ id, patch: { title: "Edited In Admin" } });
      await client.admin.catalog.retire({ id });
      expect(await seedCatalog(fresh.services.db, bundledCatalogText())).toEqual({ seeded: 0 });
      const [row] = await fresh.rows(sql`SELECT title, retired_at FROM exercise WHERE id = ${id}`);
      expect(row?.title).toBe("Edited In Admin");
      expect(row?.retired_at).not.toBeNull();
    } finally {
      await fresh.close();
    }
  });
});
