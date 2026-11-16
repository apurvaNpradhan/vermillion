import { uuidv7 } from "@workspace/db/columns";
import {
  computeOpsDigest,
  MEDIA_FINAL_PURGE_DELAY_SECONDS,
  mediaObjectKey,
  SYNC_SCHEMA_VERSION,
  type SyncFailureCode,
  type SyncOp,
  type SyncUploadResult,
} from "@workspace/shared";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createSignedInUser, createTestApp, type TestApp } from "../platform/testing/harness";
import { mediaPurgeQueue, retireUserMedia } from "./index";

const syncOptions = {
  config: {
    sync: {
      endpoint: "http://127.0.0.1:8090",
      slotLag: { warnBytes: 1024 ** 3, criticalBytes: 3 * 1024 ** 3 },
    },
  },
};

const FULL = 1200;
const THUMB = 300;
const bodyOf = (length: number) => new Uint8Array(length).fill(7);

/** Needs the MinIO of `pnpm db:start`: these tests sign real URLs and call the store. */
describe("user media", () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await createTestApp(syncOptions);
    const probe = await fetch(app.services.config.media.endpoint + "/minio/health/live").catch(
      () => null,
    );
    if (!probe?.ok) throw new Error("MinIO is not running: start it with `pnpm db:start`");
  });
  afterAll(async () => app.close());

  it("validates avatar references and retires the replaced avatar", async () => {
    const me = await writer("avatar-owner@example.com");
    const other = await writer("avatar-other@example.com");
    const avatar = uuidv7(),
      next = uuidv7(),
      wrong = uuidv7();
    expect(
      await me.send([
        putMedia(avatar, { kind: "avatar" }),
        putMedia(next, { kind: "avatar" }),
        putMedia(wrong),
      ]),
    ).toEqual(applied);
    for (const id of [uuidv7(), wrong])
      await expect(
        me.client.preferences.update({ ui: { avatarMediaId: id } }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      other.client.preferences.update({ ui: { avatarMediaId: avatar } }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await me.client.preferences.update({ ui: { avatarMediaId: avatar } });
    expect(
      (await me.client.preferences.update({ ui: { avatarMediaId: next } })).ui.avatarMediaId,
    ).toBe(next);
    expect(
      (await app.rows(sql`SELECT deleted_at FROM media WHERE id = ${avatar}`))[0]?.deleted_at,
    ).not.toBeNull();
    await expect(
      me.client.preferences.update({ ui: { avatarMediaId: avatar } }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("accepts Custom exercise images and refuses foreign, missing and wrong-kind references", async () => {
    const me = await writer("exercise-image-owner@example.com");
    const other = await writer("exercise-image-other@example.com");
    const image = uuidv7(),
      wrong = uuidv7(),
      foreign = uuidv7(),
      exercise = uuidv7();
    await me.send([putMedia(image, { kind: "exercise_image" }), putMedia(wrong)]);
    await other.send([putMedia(foreign, { kind: "exercise_image" })]);
    const fields = {
      title: "Photo exercise",
      primary_muscle: "chest",
      equipment: "dumbbell",
      exercise_type: "weight_reps",
    };
    expect(
      await me.send([op("PUT", "exercise", exercise, { ...fields, image_media_id: image })]),
    ).toEqual(applied);
    for (const id of [uuidv7(), wrong, foreign])
      expect(
        await me.send([op("PATCH", "exercise", exercise, { image_media_id: id })]),
      ).toMatchObject(rejected("MEDIA_REFERENCE_INVALID"));
    expect(
      await me.send([op("PUT", "exercise", uuidv7(), { ...fields, image_media_id: image })]),
    ).toMatchObject(rejected("MEDIA_REFERENCE_INVALID"));
    await me.send([op("DELETE", "media", image)]);
    expect(
      await me.send([op("PATCH", "exercise", exercise, { image_media_id: image })]),
    ).toMatchObject(rejected("MEDIA_REFERENCE_INVALID"));
    const catalog = uuidv7();
    await app.services.db.execute(
      sql`INSERT INTO exercise (id, title, primary_muscle, equipment, exercise_type) VALUES (${catalog}, 'Catalog photo fixture', 'chest', 'dumbbell', 'weight_reps')`,
    );
    expect(
      await me.send([op("PATCH", "exercise", catalog, { image_media_id: image })]),
    ).toMatchObject(rejected("EXERCISE_CATALOG_READ_ONLY"));
  });

  it("limits Session photos to four and validates both references", async () => {
    const me = await writer("session-photo-owner@example.com");
    const other = await writer("session-photo-other@example.com");
    const session = uuidv7(),
      foreignSession = uuidv7(),
      foreign = uuidv7(),
      wrong = uuidv7();
    const sessionData = {
      title: "Photos",
      started_at: new Date().toISOString(),
      device_id: uuidv7(),
    };
    expect(
      await me.send([op("PUT", "training_session", session, sessionData), putMedia(wrong)]),
    ).toEqual(applied);
    await other.send([
      op("PUT", "training_session", foreignSession, sessionData),
      putMedia(foreign, { kind: "session_photo" }),
    ]);
    const photo = (parent: string, media: string, position = 0) =>
      op("PUT", "session_photo", uuidv7(), { session_id: parent, media_id: media, position });
    for (const id of [uuidv7(), wrong, foreign])
      expect(await me.send([photo(session, id)])).toMatchObject(
        rejected("MEDIA_REFERENCE_INVALID"),
      );
    for (let i = 0; i < 5; i++) {
      const media = uuidv7();
      await me.send([putMedia(media, { kind: "session_photo" })]);
      if (i === 0)
        expect(await me.send([photo(foreignSession, media)])).toMatchObject(
          rejected("SESSION_PARENT_NOT_FOUND"),
        );
      if (i === 1) {
        const [existing] = await app.rows(
          sql`SELECT media_id FROM session_photo WHERE session_id = ${session} AND deleted_at IS NULL`,
        );
        expect(await me.send([photo(session, String(existing?.media_id))])).toMatchObject(
          rejected("MEDIA_REFERENCE_INVALID"),
        );
      }
      expect(await me.send([photo(session, media, i)])).toMatchObject(
        i < 4 ? applied : rejected("TRAINING_LIMIT_REACHED"),
      );
    }
  });

  it("cleans Session photo media after deletion, and neutralises cleanup after Undo", async () => {
    const me = await writer("session-photo-cleanup@example.com");
    for (const undo of [false, true]) {
      const session = uuidv7(),
        photo = uuidv7(),
        media = uuidv7();
      const data = { title: "Cleanup", started_at: new Date().toISOString(), device_id: uuidv7() };
      expect(
        await me.send([
          op("PUT", "training_session", session, data),
          putMedia(media, { kind: "session_photo" }),
          op("PUT", "session_photo", photo, { session_id: session, media_id: media, position: 0 }),
        ]),
      ).toEqual(applied);
      expect(await me.send([op("DELETE", "training_session", session)])).toEqual(applied);
      const [job] = await app.rows(
        sql`SELECT id, extract(epoch from (start_after - now()))::int as delay FROM pgboss.job WHERE name = 'training.session-media-cleanup' AND data->>'sessionId' = ${session}`,
      );
      expect(Number(job?.delay)).toBeGreaterThan(45);
      expect((await stored(media))?.deleted_at).toBeNull();
      if (undo)
        expect(
          await me.send([op("PUT", "training_session", session, { ...data, restore: 1 })]),
        ).toEqual(applied);
      else
        await app.rows(
          sql`UPDATE training_session SET deleted_at = now() - interval '2 minutes' WHERE id = ${session}`,
        );
      await app.rows(sql`UPDATE pgboss.job SET start_after = now() WHERE id = ${job?.id}`);
      await expect
        .poll(
          async () =>
            (await app.rows(sql`SELECT state FROM pgboss.job WHERE id = ${job?.id}`))[0]?.state,
          { timeout: 20_000 },
        )
        .toBe("completed");
      if (undo) {
        expect((await stored(media))?.deleted_at).toBeNull();
        expect(await me.send([op("DELETE", "session_photo", photo)])).toEqual(applied);
      }
      expect((await stored(media))?.deleted_at).not.toBeNull();
      expect(
        await me.send([
          op("PUT", "session_photo", uuidv7(), {
            session_id: session,
            media_id: media,
            position: 1,
          }),
        ]),
      ).toMatchObject(rejected(undo ? "MEDIA_REFERENCE_INVALID" : "SESSION_PARENT_NOT_FOUND"));
    }
  });

  type Client = ReturnType<TestApp["client"]>;
  function installOf(client: Client, userId: string) {
    const installId = uuidv7();
    let txId = 0;
    return {
      userId,
      client,
      send: (ops: SyncOp[]): Promise<SyncUploadResult> => {
        txId += 1;
        return client.sync.upload({
          userId,
          installId,
          txId,
          schemaVersion: SYNC_SCHEMA_VERSION,
          digest: computeOpsDigest(ops),
          ops,
        });
      },
    };
  }
  async function writer(email: string) {
    const client = app.client(await createSignedInUser(app, email));
    const { userId } = await client.sync.credentials();
    return installOf(client, userId);
  }
  type Writer = Awaited<ReturnType<typeof writer>>;

  const applied: SyncUploadResult = { status: "applied" };
  const rejected = (code: SyncFailureCode): Partial<SyncUploadResult> => ({
    status: "rejected",
    code,
  });
  const op = (kind: SyncOp["op"], table: string, id: string, opData?: SyncOp["opData"]): SyncOp =>
    opData ? { op: kind, table, id, opData } : { op: kind, table, id };
  const mediaData = (extra: Record<string, string | number | null> = {}) => ({
    kind: "program_cover",
    mime: "image/jpeg",
    width: 1024,
    height: 768,
    bytes: FULL,
    thumb_bytes: THUMB,
    ...extra,
  });
  const putMedia = (id: string, extra: Record<string, string | number | null> = {}) =>
    op("PUT", "media", id, mediaData(extra));

  async function newMedia(me: Writer, extra: Record<string, string | number | null> = {}) {
    const id = uuidv7();
    expect(await me.send([putMedia(id, extra)])).toEqual(applied);
    return id;
  }
  const stored = async (id: string) =>
    (await app.rows(sql`SELECT * FROM media WHERE id = ${id}`))[0];

  /** Uploads both objects through the signed URLs, the way a device does. */
  async function upload(me: Writer, mediaId: string) {
    for (const [variant, length] of [
      ["full", FULL],
      ["thumb", THUMB],
    ] as const) {
      const signed = await me.client.media.uploadUrl({ mediaId, variant });
      const response = await fetch(signed.url, {
        method: "PUT",
        headers: signed.headers,
        body: bodyOf(length),
      });
      expect(response.status).toBe(200);
    }
  }
  const exists = async (me: Writer, mediaId: string, variant: "full" | "thumb") => {
    const key = mediaObjectKey(me.userId, mediaId, variant);
    const { url } = await app.services.objectStore.signGet(key, { expiresInSeconds: 60 });
    return (await fetch(url)).status === 200;
  };

  describe("media rows", () => {
    it("creates a row from a device, owned by the session user", async () => {
      const me = await writer("media-create@example.com");
      const id = await newMedia(me);
      expect(await stored(id)).toMatchObject({
        user_id: me.userId,
        kind: "program_cover",
        mime: "image/jpeg",
        width: 1024,
        height: 768,
        bytes: FULL,
        thumb_bytes: THUMB,
        deleted_at: null,
        objects_purged_at: null,
      });
    });

    it("accepts a repeated PUT with the same values and refuses changed ones", async () => {
      const me = await writer("media-immutable@example.com");
      const id = await newMedia(me);
      expect(await me.send([putMedia(id)])).toEqual(applied);
      expect(await me.send([putMedia(id, { width: 512 })])).toMatchObject(
        rejected("MEDIA_IMMUTABLE"),
      );
      expect(await me.send([op("PATCH", "media", id, { width: 512 })])).toMatchObject(
        rejected("MEDIA_IMMUTABLE"),
      );
      expect(await stored(id)).toMatchObject({ width: 1024 });
    });

    it("refuses unknown kinds, bad sizes, server columns and ids that are not UUIDv7", async () => {
      const me = await writer("media-invalid@example.com");
      const bad: Record<string, string | number | null>[] = [
        { kind: "video" },
        { mime: "image/png" },
        { width: 0 },
        { height: 4096 },
        { bytes: 15 * 1024 * 1024 + 1 },
        { thumb_bytes: 0 },
        { user_id: me.userId },
        { deleted_at: null },
      ];
      for (const extra of bad) {
        expect(await me.send([putMedia(uuidv7(), extra)])).toMatchObject(
          rejected("SYNC_INVALID_OP"),
        );
      }
      expect(await me.send([putMedia("00000000-0000-4000-8000-000000000001")])).toMatchObject(
        rejected("SYNC_INVALID_OP"),
      );
    });

    it("refuses another user's id, and treats foreign PATCH and DELETE as missing", async () => {
      const a = await writer("media-owner@example.com");
      const b = await writer("media-other@example.com");
      const id = await newMedia(a);
      expect(await b.send([putMedia(id)])).toMatchObject(rejected("SYNC_ID_CONFLICT"));
      expect(await b.send([op("DELETE", "media", id)])).toMatchObject(
        rejected("SYNC_ROW_NOT_FOUND"),
      );
      expect(await b.send([op("PATCH", "media", id, {})])).toMatchObject(
        rejected("SYNC_ROW_NOT_FOUND"),
      );
      expect(await stored(id)).toMatchObject({ user_id: a.userId, deleted_at: null });
    });

    it("soft-deletes once and never brings a deleted row back", async () => {
      const me = await writer("media-delete@example.com");
      const id = await newMedia(me);
      expect(await me.send([op("DELETE", "media", id)])).toEqual(applied);
      const first = (await stored(id))?.deleted_at;
      expect(first).not.toBeNull();
      expect(await me.send([op("DELETE", "media", id)])).toEqual(applied);
      expect((await stored(id))?.deleted_at).toEqual(first);
      expect(await me.send([putMedia(id)])).toMatchObject(rejected("SYNC_ROW_DELETED"));
    });
  });

  describe("signed URLs", () => {
    it("needs a session, and an owned live media", async () => {
      const me = await writer("media-urls@example.com");
      const other = await writer("media-urls-other@example.com");
      const id = await newMedia(me);
      await expect(
        app.client().media.uploadUrl({ mediaId: id, variant: "full" }),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
      await expect(
        app.client().media.downloadUrl({ mediaId: id, variant: "full" }),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });

      for (const [client, mediaId] of [
        [other.client, id],
        [me.client, uuidv7()],
      ] as const) {
        await expect(client.media.uploadUrl({ mediaId, variant: "full" })).rejects.toMatchObject({
          code: "NOT_FOUND",
        });
        await expect(client.media.downloadUrl({ mediaId, variant: "thumb" })).rejects.toMatchObject(
          { code: "NOT_FOUND" },
        );
      }

      await me.send([op("DELETE", "media", id)]);
      await expect(
        me.client.media.uploadUrl({ mediaId: id, variant: "full" }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(
        me.client.media.downloadUrl({ mediaId: id, variant: "full" }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("rejects an unknown variant", async () => {
      const me = await writer("media-variant@example.com");
      const id = await newMedia(me);
      await expect(
        // @ts-expect-error a variant the contract does not have
        me.client.media.uploadUrl({ mediaId: id, variant: "huge" }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    });

    it("expires the upload in five minutes and the download in an hour", async () => {
      const me = await writer("media-expiry@example.com");
      const id = await newMedia(me);
      const up = await me.client.media.uploadUrl({ mediaId: id, variant: "full" });
      const down = await me.client.media.downloadUrl({ mediaId: id, variant: "full" });
      const minutes = (iso: string) => (Date.parse(iso) - Date.now()) / 60_000;
      expect(minutes(up.expiresAt)).toBeGreaterThan(4.5);
      expect(minutes(up.expiresAt)).toBeLessThanOrEqual(5);
      expect(minutes(down.expiresAt)).toBeGreaterThan(59);
      expect(minutes(down.expiresAt)).toBeLessThanOrEqual(60);
      expect(new URL(up.url).searchParams.get("X-Amz-Expires")).toBe("300");
      expect(new URL(down.url).searchParams.get("X-Amz-Expires")).toBe("3600");
    });

    it("puts under the user's prefix and reads back what was put", async () => {
      const me = await writer("media-roundtrip@example.com");
      const id = await newMedia(me);
      await upload(me, id);
      const full = await me.client.media.downloadUrl({ mediaId: id, variant: "full" });
      const thumb = await me.client.media.downloadUrl({ mediaId: id, variant: "thumb" });
      const fullResponse = await fetch(full.url);
      expect(fullResponse.status).toBe(200);
      expect(new Uint8Array(await fullResponse.arrayBuffer())).toEqual(bodyOf(FULL));
      expect((await (await fetch(thumb.url)).arrayBuffer()).byteLength).toBe(THUMB);
      expect(new URL(full.url).pathname).toContain(`/users/${me.userId}/${id}.jpg`);
      expect(new URL(thumb.url).pathname).toContain(`/users/${me.userId}/${id}_t.jpg`);
    });

    it("keeps the bucket private: the same path without a signature is refused", async () => {
      const me = await writer("media-private@example.com");
      const id = await newMedia(me);
      await upload(me, id);
      const { url } = await me.client.media.downloadUrl({ mediaId: id, variant: "full" });
      const bare = new URL(url);
      bare.search = "";
      expect((await fetch(bare)).status).toBe(403);
      expect((await fetch(bare, { method: "PUT", body: bodyOf(FULL) })).status).toBe(403);
    });

    it("lets the store refuse a body of another length or type than the row's", async () => {
      const me = await writer("media-signed-headers@example.com");
      const id = await newMedia(me);
      const signed = await me.client.media.uploadUrl({ mediaId: id, variant: "full" });
      expect(signed.headers).toEqual({
        "Content-Type": "image/jpeg",
        "Content-Length": String(FULL),
      });
      const longer = await fetch(signed.url, {
        method: "PUT",
        headers: { "Content-Type": "image/jpeg" },
        body: bodyOf(FULL + 100),
      });
      expect(longer.status).toBe(403);
      const wrongType = await fetch(signed.url, {
        method: "PUT",
        headers: { "Content-Type": "image/png" },
        body: bodyOf(FULL),
      });
      expect(wrongType.status).toBe(403);
      expect(await exists(me, id, "full")).toBe(false);
      const right = await fetch(signed.url, {
        method: "PUT",
        headers: signed.headers,
        body: bodyOf(FULL),
      });
      expect(right.status).toBe(200);
    });

    it("signs the thumbnail with the thumbnail's length", async () => {
      const me = await writer("media-thumb-length@example.com");
      const id = await newMedia(me);
      const signed = await me.client.media.uploadUrl({ mediaId: id, variant: "thumb" });
      expect(signed.headers["Content-Length"]).toBe(String(THUMB));
      const wrong = await fetch(signed.url, {
        method: "PUT",
        headers: { "Content-Type": "image/jpeg" },
        body: bodyOf(FULL),
      });
      expect(wrong.status).toBe(403);
    });

    it("limits how often URLs are signed", async () => {
      const limited = await createTestApp(syncOptions);
      try {
        const client = limited.client(await createSignedInUser(limited, "media-limit@example.com"));
        let refused = 0;
        for (let i = 0; i < 620 && refused === 0; i += 1) {
          await client.media
            .downloadUrl({ mediaId: uuidv7(), variant: "thumb" })
            .catch((error: { code?: string }) => {
              if (error.code === "TOO_MANY_REQUESTS") refused += 1;
            });
        }
        expect(refused).toBe(1);
      } finally {
        await limited.close();
      }
    });
  });

  describe("program covers", () => {
    const putProgram = (id: string, extra: Record<string, string | number | null> = {}) =>
      op("PUT", "program", id, {
        title: "Push Pull Legs",
        description: null,
        planned_weeks: null,
        ...extra,
      });
    const coverOf = async (programId: string) =>
      (await app.rows(sql`SELECT cover_media_id FROM program WHERE id = ${programId}`))[0]
        ?.cover_media_id;

    it("points a Program at its own program-cover media, on create and on patch", async () => {
      const me = await writer("cover-own@example.com");
      const first = await newMedia(me);
      const second = await newMedia(me);
      const programId = uuidv7();
      expect(await me.send([putProgram(programId, { cover_media_id: first })])).toEqual(applied);
      expect(await coverOf(programId)).toBe(first);

      // The device moves the reference to the new media and deletes the old one in one transaction.
      expect(
        await me.send([
          op("PATCH", "program", programId, { cover_media_id: second }),
          op("DELETE", "media", first),
        ]),
      ).toEqual(applied);
      expect(await coverOf(programId)).toBe(second);
      expect((await stored(first))?.deleted_at).not.toBeNull();

      expect(await me.send([op("PATCH", "program", programId, { cover_media_id: null })])).toEqual(
        applied,
      );
      expect(await coverOf(programId)).toBeNull();
    });

    it("refuses a cover that is missing, another user's, or of another kind", async () => {
      const me = await writer("cover-refused@example.com");
      const other = await writer("cover-refused-other@example.com");
      const programId = uuidv7();
      await me.send([putProgram(programId)]);
      const foreign = await newMedia(other);
      const wrongKind = await newMedia(me, { kind: "exercise_image" });
      const gone = await newMedia(me);
      await me.send([op("DELETE", "media", gone)]);

      for (const cover of [uuidv7(), foreign, wrongKind, gone]) {
        expect(
          await me.send([op("PATCH", "program", programId, { cover_media_id: cover })]),
        ).toMatchObject(rejected("MEDIA_REFERENCE_INVALID"));
        expect(await me.send([putProgram(uuidv7(), { cover_media_id: cover })])).toMatchObject(
          rejected("MEDIA_REFERENCE_INVALID"),
        );
      }
      expect(await coverOf(programId)).toBeNull();
      expect(
        await me.send([op("PATCH", "program", programId, { cover_media_id: "not-a-uuid" })]),
      ).toMatchObject(rejected("SYNC_INVALID_OP"));
    });

    it("lets an Undo put back a Program whose cover is still the stored one", async () => {
      const me = await writer("cover-undo@example.com");
      const media = await newMedia(me);
      const programId = uuidv7();
      await me.send([putProgram(programId, { cover_media_id: media })]);
      await me.send([op("DELETE", "program", programId)]);
      // The cover was deleted meanwhile; the restore repeats the reference it already had.
      await me.send([op("DELETE", "media", media)]);
      expect(await me.send([putProgram(programId, { cover_media_id: media, restore: 1 })])).toEqual(
        applied,
      );
      expect(await coverOf(programId)).toBe(media);
    });
  });

  describe("purging objects", () => {
    const completedRuns = async () =>
      Number(
        (
          await app.rows(
            sql`select count(*)::int as n from pgboss.job where name = 'media.purge-objects' and state = 'completed'`,
          )
        )[0]?.n,
      );
    /** Enqueues the job and waits for that run (not an earlier one) to complete. */
    async function runPurgeJob() {
      const before = await completedRuns();
      await app.services.jobs.enqueue(mediaPurgeQueue, {});
      await expect.poll(completedRuns, { timeout: 20_000 }).toBeGreaterThan(before);
    }
    const age = (id: string, minutes: number) =>
      app.rows(
        sql`UPDATE media SET deleted_at = now() - make_interval(mins => ${minutes}) WHERE id = ${id}`,
      );

    it("deletes the objects of media deleted over an hour ago, once, and keeps the rest", async () => {
      const me = await writer("media-purge@example.com");
      const old = await newMedia(me);
      const fresh = await newMedia(me);
      const live = await newMedia(me);
      for (const id of [old, fresh, live]) await upload(me, id);
      await me.send([op("DELETE", "media", old), op("DELETE", "media", fresh)]);
      await age(old, 120);
      await age(fresh, 10);

      await runPurgeJob();

      expect(await exists(me, old, "full")).toBe(false);
      expect(await exists(me, old, "thumb")).toBe(false);
      expect((await stored(old))?.objects_purged_at).not.toBeNull();
      // Deleted a moment ago: kept through the grace period. Live: never touched.
      expect(await exists(me, fresh, "full")).toBe(true);
      expect((await stored(fresh))?.objects_purged_at).toBeNull();
      expect(await exists(me, live, "full")).toBe(true);
      expect(await exists(me, live, "thumb")).toBe(true);

      // Idempotent: a second run changes nothing, and the grace period eventually passes.
      const marked = (await stored(old))?.objects_purged_at;
      await age(fresh, 90);
      await runPurgeJob();
      expect((await stored(fresh))?.objects_purged_at).not.toBeNull();
      expect(await exists(me, fresh, "full")).toBe(false);
      expect((await stored(old))?.objects_purged_at).toEqual(marked);
      expect(await exists(me, live, "full")).toBe(true);
    });

    it("marks a deleted media whose objects were never uploaded", async () => {
      const me = await writer("media-purge-empty@example.com");
      const id = await newMedia(me);
      await me.send([op("DELETE", "media", id)]);
      await age(id, 120);
      await runPurgeJob();
      expect((await stored(id))?.objects_purged_at).not.toBeNull();
    });
  });

  describe("account deletion", () => {
    async function signedInWriter(email: string) {
      const session = await createSignedInUser(app, email);
      const client = app.client(session);
      const { userId } = await client.sync.credentials();
      return installOf(client, userId);
    }
    async function deleteAccount(me: Writer, email: string) {
      await me.client.account.requestDeletion({ callbackURL: "cinnabar://confirm-deletion" });
      const mail = await app.waitForEmail(
        (m) => m.to === email && /deleting|Löschen/.test(m.subject),
      );
      const token = /confirm-deletion\?token=([a-z0-9]+)/.exec(mail.text)?.[1];
      await me.client.account.confirmDeletion({ token: token ?? "" });
    }

    it("removes every object under the user's prefix and leaves other users alone", async () => {
      const email = "media-leaving@example.com";
      const me = await signedInWriter(email);
      const bystander = await writer("media-staying@example.com");

      const ids = [await newMedia(me), await newMedia(me), await newMedia(me)];
      for (const id of ids) await upload(me, id);
      // One of them is deleted already: its objects are still in the bucket until purged.
      await me.send([op("DELETE", "media", ids[0] ?? "")]);
      const kept = await newMedia(bystander);
      await upload(bystander, kept);
      expect(await exists(me, ids[1] ?? "", "full")).toBe(true);

      await deleteAccount(me, email);

      for (const id of ids) {
        expect(await exists(me, id, "full")).toBe(false);
        expect(await exists(me, id, "thumb")).toBe(false);
      }
      expect(await exists(bystander, kept, "full")).toBe(true);
      expect(await app.rows(sql`SELECT id FROM media WHERE user_id = ${me.userId}`)).toEqual([]);
    });

    it("refuses new URLs from the moment deletion begins", async () => {
      const me = await writer("media-retired@example.com");
      const id = await newMedia(me);
      await retireUserMedia(app.services.db, me.userId);
      await expect(
        me.client.media.uploadUrl({ mediaId: id, variant: "full" }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(
        me.client.media.downloadUrl({ mediaId: id, variant: "thumb" }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect((await stored(id))?.deleted_at).not.toBeNull();
      // Idempotent, and another user's media is untouched.
      const other = await writer("media-not-retired@example.com");
      const otherId = await newMedia(other);
      await retireUserMedia(app.services.db, me.userId);
      expect((await stored(otherId))?.deleted_at).toBeNull();
    });

    it("removes an object uploaded after the deletion with a URL signed before it", async () => {
      const email = "media-late-put@example.com";
      const me = await signedInWriter(email);
      const id = await newMedia(me);
      // A 5-minute PUT URL, signed just before the account is deleted.
      const signed = await me.client.media.uploadUrl({ mediaId: id, variant: "full" });

      await deleteAccount(me, email);
      expect(await exists(me, id, "full")).toBe(false);

      // The URL still works: the object comes back, in a prefix nobody owns any more.
      const late = await fetch(signed.url, {
        method: "PUT",
        headers: signed.headers,
        body: bodyOf(FULL),
      });
      expect(late.status).toBe(200);
      expect(await exists(me, id, "full")).toBe(true);

      // A final purge was persisted, due after the URL's lifetime plus time for a slow upload.
      const jobs = () =>
        app.rows(
          sql`select id, extract(epoch from (start_after - now()))::int as in_seconds
              from pgboss.job where name = 'account.final-purge' and data->>'userId' = ${me.userId}`,
        );
      const [job] = await jobs();
      expect(job).toBeDefined();
      expect(Number(job?.in_seconds)).toBeGreaterThan(MEDIA_FINAL_PURGE_DELAY_SECONDS - 120);
      expect(Number(job?.in_seconds)).toBeLessThanOrEqual(MEDIA_FINAL_PURGE_DELAY_SECONDS);
      expect(MEDIA_FINAL_PURGE_DELAY_SECONDS).toBeGreaterThan(5 * 60);

      // When it falls due, it removes the object.
      await app.rows(sql`update pgboss.job set start_after = now() where id = ${job?.id}`);
      await expect.poll(() => exists(me, id, "full"), { timeout: 30_000 }).toBe(false);
    });
  });

  describe("object store", () => {
    it("deletes a prefix of more than a thousand objects, a page at a time", async () => {
      const prefix = `tests/many-${uuidv7()}/`;
      const count = 1_050;
      const put = async (index: number) => {
        const { url, headers } = await app.services.objectStore.signPut(`${prefix}${index}.jpg`, {
          contentType: "image/jpeg",
          contentLength: 3,
          expiresInSeconds: 60,
        });
        const response = await fetch(url, { method: "PUT", headers, body: bodyOf(3) });
        expect(response.status).toBe(200);
      };
      for (let start = 0; start < count; start += 50) {
        await Promise.all(
          Array.from({ length: Math.min(50, count - start) }, (_, i) => put(start + i)),
        );
      }
      const other = `tests/other-${uuidv7()}/keep.jpg`;
      const kept = await app.services.objectStore.signPut(other, {
        contentType: "image/jpeg",
        contentLength: 3,
        expiresInSeconds: 60,
      });
      await fetch(kept.url, { method: "PUT", headers: kept.headers, body: bodyOf(3) });

      expect(await app.services.objectStore.deletePrefix(prefix)).toBe(count);
      expect(await app.services.objectStore.deletePrefix(prefix)).toBe(0);
      const { url } = await app.services.objectStore.signGet(other, { expiresInSeconds: 60 });
      expect((await fetch(url)).status).toBe(200);
      await app.services.objectStore.deleteObject(other);
    }, 60_000);
  });
});
