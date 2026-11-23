import {
  SHARE_CODE_ALPHABET,
  serializeProgram,
  serializeWorkout,
  shareCodeSchema,
  type ShareExerciseSource,
} from "@workspace/shared";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createSignedInUser, createTestApp, type TestApp } from "../platform/testing/harness";
import { createLink, generateShareCode, LIVE_LINKS_PER_USER } from "./operations/links";

const squat: ShareExerciseSource = {
  id: "0194a2d0-0000-7000-8000-0000000000a1",
  custom: false,
  title: "Squat",
  equipment: "barbell",
  exerciseType: "weight_reps",
  primaryMuscle: "quadriceps",
  secondaryMuscles: ["glutes"],
};

const workout = (id = "w", title = "Legs") => ({
  id,
  title,
  note: null,
  exercises: [
    {
      exercise: squat,
      restSeconds: 180,
      note: null,
      supersetGroup: null,
      sets: [{ kind: "working" as const, reps_min: 5, reps_max: 5, weight_kg: 140 }],
    },
  ],
});

const workoutSnapshot = (title = "Legs") =>
  serializeWorkout(workout("w", title), { weights: true });
const programSnapshot = () =>
  serializeProgram(
    {
      title: "Strength",
      description: "Three days",
      plannedWeeks: 8,
      sessionsPerWeek: 3,
      workouts: [workout("a", "Day A")],
      rotation: ["a", null],
    },
    { weights: false },
  );

describe("share links", () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => app.close());

  it("makes codes of six characters from the unambiguous alphabet", () => {
    for (let at = 0; at < 200; at++) {
      const code = generateShareCode();
      expect(shareCodeSchema.safeParse(code).success).toBe(true);
      for (const char of code) expect(SHARE_CODE_ALPHABET).toContain(char);
    }
  });

  it("requires sign-in to create, list or revoke", async () => {
    const anonymous = app.client();
    await expect(anonymous.share.create({ snapshot: workoutSnapshot() })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await expect(anonymous.share.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(anonymous.share.revoke({ code: "ABCDEF" })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("stores a snapshot that anyone can read by its code, without signing in", async () => {
    const owner = app.client(await createSignedInUser(app, "share-owner@example.com"));
    const link = await owner.share.create({ snapshot: programSnapshot() });
    expect(link).toMatchObject({ kind: "program", title: "Strength" });
    expect(shareCodeSchema.safeParse(link.code).success).toBe(true);

    const read = await app.client().share.get({ code: link.code });
    expect(read.snapshot).toEqual(programSnapshot());
    // Nothing about the owner is served.
    expect(JSON.stringify(read)).not.toContain("share-owner");
    expect(Object.keys(read).sort()).toEqual(["code", "createdAt", "snapshot"]);
  });

  it("refuses a snapshot that does not validate", async () => {
    const owner = app.client(await createSignedInUser(app, "share-invalid@example.com"));
    const bad = { ...workoutSnapshot(), format: "sigil.workout/v9" };
    // Safety: the test sends a document the contract must refuse.
    await expect(owner.share.create({ snapshot: bad as never })).rejects.toThrow();
  });

  it("answers unknown codes with NOT_FOUND and malformed ones with BAD_REQUEST", async () => {
    await expect(app.client().share.get({ code: "AAAAAA" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(app.client().share.get({ code: "AAAAA0" })).rejects.toThrow();
  });

  it("lists only the caller's live links, and revoking turns a link into GONE", async () => {
    const owner = app.client(await createSignedInUser(app, "share-revoker@example.com"));
    const other = app.client(await createSignedInUser(app, "share-other@example.com"));
    const first = await owner.share.create({ snapshot: workoutSnapshot("First") });
    const second = await owner.share.create({ snapshot: workoutSnapshot("Second") });
    await other.share.create({ snapshot: workoutSnapshot("Theirs") });

    expect((await owner.share.list()).links.map((link) => link.title)).toEqual(["Second", "First"]);

    // Someone else's code is indistinguishable from an unknown one.
    await expect(other.share.revoke({ code: first.code })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(app.client().share.get({ code: first.code })).resolves.toBeDefined();

    expect(await owner.share.revoke({ code: first.code })).toEqual({ revoked: true });
    // Revoking twice is fine.
    expect(await owner.share.revoke({ code: first.code })).toEqual({ revoked: true });

    await expect(app.client().share.get({ code: first.code })).rejects.toMatchObject({
      code: "GONE",
    });
    await expect(app.client().share.get({ code: second.code })).resolves.toBeDefined();
    expect((await owner.share.list()).links.map((link) => link.title)).toEqual(["Second"]);
  });

  it("retries a taken code and never reuses one", async () => {
    const headers = await createSignedInUser(app, "share-collide@example.com");
    const owner = app.client(headers);
    const taken = await owner.share.create({ snapshot: workoutSnapshot() });
    const user = await app.rows(
      sql`SELECT id FROM "user" WHERE email = 'share-collide@example.com'`,
    );
    const userId = String(user[0]?.id);
    const codes = [taken.code, taken.code, "ZZZZZZ"];
    const result = await createLink(
      app.services.db,
      userId,
      workoutSnapshot(),
      () => codes.shift() ?? "YYYYYY",
    );
    expect(result).toMatchObject({ status: "created", link: { code: "ZZZZZZ" } });
    expect(await createLink(app.services.db, userId, workoutSnapshot(), () => taken.code)).toEqual({
      status: "no-code",
    });
  });

  it("caps the live links of one account", async () => {
    const headers = await createSignedInUser(app, "share-capped@example.com");
    const owner = app.client(headers);
    const user = await app.rows(
      sql`SELECT id FROM "user" WHERE email = 'share-capped@example.com'`,
    );
    const userId = String(user[0]?.id);
    await app.services.db.execute(sql`
      INSERT INTO share_link (id, user_id, code, kind, title, snapshot)
      SELECT gen_random_uuid(), ${userId}, upper(substr(md5(n::text), 1, 6)), 'workout', 'x', '{}'::jsonb
      FROM generate_series(1, ${LIVE_LINKS_PER_USER}) AS n`);
    await expect(owner.share.create({ snapshot: workoutSnapshot() })).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("removes a user's links with the account", async () => {
    const owner = app.client(await createSignedInUser(app, "share-deleted@example.com"));
    const link = await owner.share.create({ snapshot: workoutSnapshot() });
    await app.services.db.execute(
      sql`DELETE FROM "user" WHERE email = 'share-deleted@example.com'`,
    );
    await expect(app.client().share.get({ code: link.code })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
