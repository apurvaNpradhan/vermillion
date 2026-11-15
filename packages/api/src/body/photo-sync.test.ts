import { uuidv7 } from "@workspace/db/columns";
import { computeOpsDigest, SYNC_SCHEMA_VERSION, type SyncOp } from "@workspace/shared";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createSignedInUser, createTestApp, type TestApp } from "../platform/testing/harness";
import { progressPhotoSyncHandler } from "./photo-sync";

describe("progress photo uploads", () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await createTestApp({
      config: {
        sync: {
          endpoint: "http://127.0.0.1:8090",
          slotLag: { warnBytes: 1024 ** 3, criticalBytes: 3 * 1024 ** 3 },
        },
      },
    });
  });
  afterAll(async () => app.close());

  async function writer() {
    const client = app.client(await createSignedInUser(app, `${uuidv7()}@example.com`));
    const { userId } = await client.sync.credentials();
    const installId = uuidv7();
    let txId = 0;
    return {
      userId,
      send(ops: SyncOp[]) {
        return client.sync.upload({
          userId,
          installId,
          txId: ++txId,
          schemaVersion: SYNC_SCHEMA_VERSION,
          digest: computeOpsDigest(ops),
          ops,
        });
      },
      /** A media row as the device writes it first, in the same transaction as its reference. */
      mediaOp(kind = "progress_photo"): SyncOp {
        return {
          op: "PUT",
          table: "media",
          id: uuidv7(),
          opData: {
            kind,
            mime: "image/jpeg",
            width: 1024,
            height: 768,
            bytes: 1200,
            thumb_bytes: 300,
          },
        };
      },
    };
  }
  type Writer = Awaited<ReturnType<typeof writer>>;

  const photoData = (mediaId: string, extra: Record<string, string> = {}) => ({
    media_id: mediaId,
    pose: "front",
    local_date: "2026-01-01",
    taken_at: "2026-01-01T12:00:00Z",
    ...extra,
  });
  const putPhoto = (mediaId: string, extra: Record<string, string> = {}): SyncOp => ({
    op: "PUT",
    table: "progress_photo",
    id: uuidv7(),
    opData: photoData(mediaId, extra),
  });

  /** Uploads a media and a photo of it as one transaction, like the device. */
  async function addPhoto(w: Writer, extra: Record<string, string> = {}) {
    const media = w.mediaOp();
    const photo = putPhoto(media.id, extra);
    const result = await w.send([media, photo]);
    return { media, photo, result };
  }

  it("round trips a photo with its media and refuses anonymous uploads", async () => {
    await expect(app.client().sync.credentials()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    const a = await writer();
    const { photo, result } = await addPhoto(a);
    expect(result).toMatchObject({ status: "applied" });
    expect(
      await app.rows(sql`SELECT pose, local_date FROM progress_photo WHERE id = ${photo.id}`),
    ).toMatchObject([{ pose: "front" }]);
    // A replayed PUT of the same values is fine, a changed one is refused.
    expect(await a.send([photo])).toMatchObject({ status: "applied" });
    expect(
      await a.send([
        { ...photo, opData: photoData(photo.opData?.media_id as string, { pose: "back" }) },
      ]),
    ).toMatchObject({ status: "rejected", code: "SYNC_INVALID_OP" });
  });

  it("refuses foreign, missing and wrong-kind media alike", async () => {
    const a = await writer();
    const b = await writer();
    const theirs = b.mediaOp();
    await b.send([theirs]);
    expect(await a.send([putPhoto(theirs.id)])).toMatchObject({
      status: "rejected",
      code: "MEDIA_REFERENCE_INVALID",
    });
    expect(await a.send([putPhoto(uuidv7())])).toMatchObject({
      status: "rejected",
      code: "MEDIA_REFERENCE_INVALID",
    });
    const cover = a.mediaOp("program_cover");
    expect(await a.send([cover, putPhoto(cover.id)])).toMatchObject({
      status: "rejected",
      code: "MEDIA_REFERENCE_INVALID",
    });
  });

  it("refuses unknown poses, bad dates, foreign ownership fields and a reused media", async () => {
    const a = await writer();
    const media = a.mediaOp();
    await a.send([media]);
    const patches: Record<string, string>[] = [
      { pose: "top" },
      { local_date: "2099-01-01" },
      { local_date: "2000-01-01", taken_at: "2000-01-01T12:00:00Z" },
      { user_id: a.userId },
    ];
    for (const patch of patches) {
      expect(await a.send([putPhoto(media.id, patch)])).toMatchObject({
        status: "rejected",
        code: "SYNC_INVALID_OP",
      });
    }
    expect(await a.send([putPhoto(media.id)])).toMatchObject({ status: "applied" });
    // A second photo of the same media would share its file with the first.
    expect(await a.send([putPhoto(media.id, { pose: "side" })])).toMatchObject({
      status: "rejected",
      code: "MEDIA_REFERENCE_INVALID",
    });
  });

  it("refuses a foreign row's edit, delete and id, and accepts only an empty PATCH", async () => {
    const a = await writer();
    const b = await writer();
    const { media, photo } = await addPhoto(a);
    expect(await b.send([{ ...photo, opData: photoData(media.id) }])).toMatchObject({
      code: "SYNC_ID_CONFLICT",
    });
    expect(await b.send([{ op: "DELETE", table: "progress_photo", id: photo.id }])).toMatchObject({
      code: "SYNC_ROW_NOT_FOUND",
    });
    expect(
      await a.send([
        { op: "PATCH", table: "progress_photo", id: photo.id, opData: { pose: "back" } },
      ]),
    ).toMatchObject({ code: "SYNC_INVALID_OP" });
    expect(
      await a.send([{ op: "PATCH", table: "progress_photo", id: photo.id, opData: {} }]),
    ).toMatchObject({ status: "applied" });
  });

  it("deletes the photo's media with it, even if the media DELETE never arrives", async () => {
    const a = await writer();
    const { media, photo } = await addPhoto(a);
    expect(await a.send([{ op: "DELETE", table: "progress_photo", id: photo.id }])).toMatchObject({
      status: "applied",
    });
    expect(
      (await app.rows(sql`SELECT deleted_at FROM progress_photo WHERE id = ${photo.id}`))[0]
        ?.deleted_at,
    ).not.toBeNull();
    expect(
      (await app.rows(sql`SELECT deleted_at FROM media WHERE id = ${media.id}`))[0]?.deleted_at,
    ).not.toBeNull();
    // Both deletes in one transaction (what the device sends) stay idempotent.
    expect(
      await a.send([
        { op: "DELETE", table: "progress_photo", id: photo.id },
        { op: "DELETE", table: "media", id: media.id },
      ]),
    ).toMatchObject({ status: "applied" });
    expect(await a.send([photo])).toMatchObject({ code: "SYNC_ROW_DELETED" });
  });

  it("purges content but keeps a marker against stale recreation", async () => {
    const a = await writer();
    const { photo } = await addPhoto(a);
    await a.send([{ op: "DELETE", table: "progress_photo", id: photo.id }]);
    await app.services.db.execute(
      sql`UPDATE progress_photo SET deleted_at = now() - interval '121 days' WHERE id = ${photo.id}`,
    );
    expect(
      await progressPhotoSyncHandler.purgeTombstones(
        app.services.db,
        new Date(Date.now() - 120 * 86400000),
      ),
    ).toBeGreaterThanOrEqual(1);
    expect(await app.rows(sql`SELECT id FROM progress_photo WHERE id = ${photo.id}`)).toEqual([]);
    expect(await a.send([photo])).toMatchObject({ code: "SYNC_ROW_DELETED" });
  });
});
