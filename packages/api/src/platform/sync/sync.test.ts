import { uuidv7 } from "@workspace/db/columns";
import {
  computeOpsDigest,
  SYNC_JWT_AUDIENCE,
  SYNC_JWT_TTL_SECONDS,
  SYNC_SCHEMA_VERSION,
  type SyncOp,
  type SyncUploadRequest,
} from "@workspace/shared";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createSignedInUser, createTestApp, type TestApp } from "../testing/harness";
import { syncPurgeQueue } from "./purge";

const ENDPOINT = "http://127.0.0.1:8090";

describe("sync", () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await createTestApp({
      config: {
        sync: {
          endpoint: ENDPOINT,
          slotLag: { warnBytes: 1024 ** 3, criticalBytes: 3 * 1024 ** 3 },
        },
      },
    });
  });
  afterAll(async () => app.close());

  async function signedIn(email: string) {
    const headers = await createSignedInUser(app, email);
    const client = app.client(headers);
    const { userId } = await client.sync.credentials();
    return { client, userId, installId: uuidv7() };
  }
  type Sender = Awaited<ReturnType<typeof signedIn>>;

  function request(
    who: Pick<Sender, "userId" | "installId">,
    txId: number,
    ops: SyncOp[],
    overrides: Partial<SyncUploadRequest> = {},
  ): SyncUploadRequest {
    return {
      userId: who.userId,
      installId: who.installId,
      txId,
      schemaVersion: SYNC_SCHEMA_VERSION,
      digest: computeOpsDigest(ops),
      ops,
      ...overrides,
    };
  }

  const put = (id: string, title: string, body = ""): SyncOp => ({
    op: "PUT",
    table: "notes",
    id,
    opData: { title, body },
  });
  const patch = (id: string, opData: SyncOp["opData"]): SyncOp => ({
    op: "PATCH",
    table: "notes",
    id,
    opData,
  });
  const del = (id: string): SyncOp => ({ op: "DELETE", table: "notes", id });

  describe("credentials", () => {
    it("requires a session", async () => {
      await expect(app.client().sync.credentials()).rejects.toMatchObject({
        code: "UNAUTHORIZED",
      });
    });

    it("returns the endpoint, a PowerSync token, the user and its expiry", async () => {
      const headers = await createSignedInUser(app, "creds@example.com");
      const before = Date.now();
      const creds = await app.client(headers).sync.credentials();
      expect(creds.endpoint).toBe(ENDPOINT);
      const session = await app.services.auth.api.getSession({ headers });
      expect(creds.userId).toBe(session?.user.id);

      const [encodedHeader = "", encodedPayload = ""] = creds.token.split(".");
      const header = JSON.parse(Buffer.from(encodedHeader, "base64url").toString());
      const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString());
      expect(header).toMatchObject({ alg: "EdDSA" });
      expect(header.kid).toEqual(expect.any(String));
      expect(payload).toMatchObject({ sub: creds.userId, aud: SYNC_JWT_AUDIENCE });
      expect(new Date(creds.expiresAt).getTime()).toBe(payload.exp * 1000);
      const ttl = new Date(creds.expiresAt).getTime() - before;
      expect(ttl).toBeGreaterThan((SYNC_JWT_TTL_SECONDS - 5) * 1000);
      expect(ttl).toBeLessThanOrEqual((SYNC_JWT_TTL_SECONDS + 5) * 1000);
    });

    it("publishes the signing key at the JWKS path PowerSync reads", async () => {
      const headers = await createSignedInUser(app, "jwks@example.com");
      const { token } = await app.client(headers).sync.credentials();
      const kid = JSON.parse(Buffer.from(token.split(".")[0] ?? "", "base64url").toString()).kid;
      const response = await app.app.request("/api/auth/jwks");
      expect(response.status).toBe(200);
      const jwks = z
        .object({ keys: z.array(z.object({ kid: z.string(), kty: z.string(), crv: z.string() })) })
        .parse(await response.json());
      expect(jwks.keys.map((key) => key.kid)).toContain(kid);
      expect(jwks.keys[0]).toMatchObject({ kty: "OKP", crv: "Ed25519" });
      expect(JSON.stringify(jwks)).not.toContain('"d":');
    });

    it("is unavailable when no endpoint is configured", async () => {
      const bare = await createTestApp();
      try {
        const headers = await createSignedInUser(bare, "bare@example.com");
        await expect(bare.client(headers).sync.credentials()).rejects.toMatchObject({
          code: "BAD_GATEWAY",
        });
      } finally {
        await bare.close();
      }
    });
  });

  describe("upload", () => {
    it("requires a session", async () => {
      const ops = [del(uuidv7())];
      await expect(
        app.client().sync.upload(request({ userId: "x", installId: uuidv7() }, 1, ops)),
      ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    });

    it("applies a transaction through the vertical's operations", async () => {
      const me = await signedIn("apply@example.com");
      const id = uuidv7();
      const result = await me.client.sync.upload(request(me, 1, [put(id, "Hello", "World")]));
      expect(result).toEqual({ status: "applied" });
      expect(await me.client.notes.get({ id })).toMatchObject({ title: "Hello", body: "World" });

      await me.client.sync.upload(request(me, 2, [patch(id, { body: "Changed" })]));
      expect(await me.client.notes.get({ id })).toMatchObject({ title: "Hello", body: "Changed" });

      await me.client.sync.upload(request(me, 3, [del(id)]));
      expect(await me.client.notes.list()).toEqual([]);
      const rows = await app.rows(sql`SELECT deleted_at FROM notes WHERE id = ${id}`);
      expect(rows[0]?.deleted_at).toBeTruthy();
    });

    it("stores the receipt with the digest and outcome", async () => {
      const me = await signedIn("receipt@example.com");
      const ops = [put(uuidv7(), "r")];
      await me.client.sync.upload(request(me, 7, ops));
      const rows = await app.rows(
        sql`SELECT digest, outcome::text AS outcome FROM sync_upload_receipts
            WHERE user_id = ${me.userId} AND install_id = ${me.installId} AND tx_id = 7`,
      );
      expect(rows).toEqual([{ digest: computeOpsDigest(ops), outcome: '{"status": "applied"}' }]);
    });

    it("answers a replay with the stored outcome and applies nothing again", async () => {
      const me = await signedIn("replay@example.com");
      const id = uuidv7();
      const create = request(me, 1, [put(id, "Once")]);
      expect(await me.client.sync.upload(create)).toEqual({ status: "applied" });
      await me.client.notes.delete({ id });

      // Re-applying would find the tombstone and reject; a replay returns the first outcome.
      expect(await me.client.sync.upload(create)).toEqual({ status: "applied" });
      const rows = await app.rows(sql`SELECT count(*)::int AS n FROM notes WHERE id = ${id}`);
      expect(rows[0]?.n).toBe(1);
    });

    it("replays a stored rejection as the same rejection", async () => {
      const me = await signedIn("replay-reject@example.com");
      const req = request(me, 1, [patch(uuidv7(), { title: "nothing here" })]);
      const first = await me.client.sync.upload(req);
      expect(first).toMatchObject({ status: "rejected", code: "SYNC_ROW_NOT_FOUND" });
      expect(await me.client.sync.upload(req)).toEqual(first);
    });

    it("refuses the same key with a different digest (409)", async () => {
      const me = await signedIn("mismatch@example.com");
      await me.client.sync.upload(request(me, 1, [put(uuidv7(), "A")]));
      await expect(
        me.client.sync.upload(request(me, 1, [put(uuidv7(), "B")])),
      ).rejects.toMatchObject({ code: "CONFLICT", data: { code: "SYNC_REPLAY_MISMATCH" } });
    });

    it("keeps another device's edit when an acknowledged upload is retried", async () => {
      const me = await signedIn("ack-loss@example.com");
      const id = uuidv7();
      await me.client.sync.upload(request(me, 1, [put(id, "Start", "v0")]));

      // Device A commits a body edit, but the response is lost.
      const edit = request(me, 2, [patch(id, { body: "from A" })]);
      await me.client.sync.upload(edit);
      // Device B (another install) then edits the same field.
      const deviceB = { ...me, installId: uuidv7() };
      await me.client.sync.upload(request(deviceB, 1, [patch(id, { body: "from B" })]));
      // A retries.
      expect(await me.client.sync.upload(edit)).toEqual({ status: "applied" });

      expect(await me.client.notes.get({ id })).toMatchObject({ body: "from B" });
    });

    it("refuses an upload queued for another account (409) and writes nothing", async () => {
      const a = await signedIn("wrong-a@example.com");
      const b = await signedIn("wrong-b@example.com");
      const id = uuidv7();
      await expect(b.client.sync.upload(request(a, 1, [put(id, "mine")]))).rejects.toMatchObject({
        code: "CONFLICT",
        data: { code: "SYNC_WRONG_ACCOUNT" },
      });
      const rows = await app.rows(sql`SELECT count(*)::int AS n FROM notes WHERE id = ${id}`);
      expect(rows[0]?.n).toBe(0);
      const receipts = await app.rows(
        sql`SELECT count(*)::int AS n FROM sync_upload_receipts WHERE install_id = ${a.installId}`,
      );
      expect(receipts[0]?.n).toBe(0);
    });

    it("does not let one user touch another's note", async () => {
      const a = await signedIn("iso-a@example.com");
      const b = await signedIn("iso-b@example.com");
      const id = uuidv7();
      await a.client.sync.upload(request(a, 1, [put(id, "A's", "secret")]));

      const update = await b.client.sync.upload(request(b, 1, [patch(id, { title: "hacked" })]));
      expect(update).toMatchObject({ status: "rejected", code: "SYNC_ROW_NOT_FOUND" });
      // Deleting someone else's note is a harmless no-op, not a disclosure.
      expect(await b.client.sync.upload(request(b, 2, [del(id)]))).toEqual({ status: "applied" });
      // Creating with an id owned by another user is refused.
      const duplicate = await b.client.sync.upload(request(b, 3, [put(id, "mine now")]));
      expect(duplicate).toMatchObject({ status: "rejected", code: "SYNC_ID_CONFLICT" });

      expect(await a.client.notes.get({ id })).toMatchObject({ title: "A's", body: "secret" });
      await expect(b.client.notes.get({ id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("reports the first failure and rolls back the siblings", async () => {
      const me = await signedIn("rollback@example.com");
      const first = uuidv7();
      const third = uuidv7();
      const result = await me.client.sync.upload(
        request(me, 1, [
          put(first, "fine"),
          patch(uuidv7(), { title: "missing" }),
          put(third, "never reached"),
        ]),
      );
      expect(result).toEqual({
        status: "rejected",
        code: "SYNC_ROW_NOT_FOUND",
        failedIndex: 1,
        ops: ["SYNC_TRANSACTION_ROLLED_BACK", "SYNC_ROW_NOT_FOUND", "SYNC_TRANSACTION_ROLLED_BACK"],
      });
      expect(await me.client.notes.list()).toEqual([]);
    });

    it("rejects invalid fields, ids, tables and unknown columns permanently", async () => {
      const me = await signedIn("invalid@example.com");
      const cases: [SyncOp, string][] = [
        [put(uuidv7(), "x".repeat(201)), "SYNC_INVALID_OP"],
        [put(uuidv7(), "   "), "SYNC_INVALID_OP"],
        [put("not-a-uuid", "x"), "SYNC_INVALID_OP"],
        [put(crypto.randomUUID(), "uuid v4 id"), "SYNC_INVALID_OP"],
        [patch(uuidv7(), { title: null }), "SYNC_INVALID_OP"],
        [
          { op: "PUT", table: "notes", id: uuidv7(), opData: { title: "t", user_id: "someone" } },
          "SYNC_INVALID_OP",
        ],
        [{ op: "PUT", table: "sessions", id: uuidv7(), opData: {} }, "SYNC_UNKNOWN_TABLE"],
      ];
      for (const [index, [op, code]] of cases.entries()) {
        expect(await me.client.sync.upload(request(me, index + 1, [op]))).toMatchObject({
          status: "rejected",
          code,
          failedIndex: 0,
        });
      }
    });

    it("rejects a NUL byte as invalid rather than failing transiently", async () => {
      const me = await signedIn("nul@example.com");
      expect(
        await me.client.sync.upload(request(me, 1, [put(uuidv7(), "a\u0000b")])),
      ).toMatchObject({
        status: "rejected",
        code: "SYNC_INVALID_OP",
      });
    });

    it("lets delete win: edits to a deleted note are rejected, not resurrected", async () => {
      const me = await signedIn("delete-wins@example.com");
      const id = uuidv7();
      await me.client.sync.upload(request(me, 1, [put(id, "doomed")]));
      await me.client.sync.upload(request(me, 2, [del(id)]));

      expect(
        await me.client.sync.upload(request(me, 3, [patch(id, { title: "late" })])),
      ).toMatchObject({
        status: "rejected",
        code: "SYNC_ROW_DELETED",
      });
      expect(await me.client.sync.upload(request(me, 4, [put(id, "again")]))).toMatchObject({
        status: "rejected",
        code: "SYNC_ROW_DELETED",
      });
      // Deleting again is harmless.
      expect(await me.client.sync.upload(request(me, 5, [del(id)]))).toEqual({ status: "applied" });
      expect(await me.client.notes.list()).toEqual([]);
    });

    it("rejects an edit to a purged note", async () => {
      const me = await signedIn("purged@example.com");
      const id = uuidv7();
      await me.client.sync.upload(request(me, 1, [put(id, "gone")]));
      await me.client.sync.upload(request(me, 2, [del(id)]));
      await app.rows(sql`DELETE FROM notes WHERE id = ${id} RETURNING id`);
      expect(
        await me.client.sync.upload(request(me, 3, [patch(id, { body: "late" })])),
      ).toMatchObject({
        status: "rejected",
        code: "SYNC_ROW_NOT_FOUND",
      });
    });

    it("sends only the dirty fields: a PATCH leaves the others alone", async () => {
      const me = await signedIn("fields@example.com");
      const id = uuidv7();
      await me.client.sync.upload(request(me, 1, [put(id, "Title", "Body")]));
      await me.client.sync.upload(request(me, 2, [patch(id, { title: "Only title" })]));
      expect(await me.client.notes.get({ id })).toMatchObject({
        title: "Only title",
        body: "Body",
      });
    });

    it("refuses a schema version outside the window", async () => {
      const me = await signedIn("version@example.com");
      for (const schemaVersion of [SYNC_SCHEMA_VERSION + 1, SYNC_SCHEMA_VERSION + 100]) {
        await expect(
          me.client.sync.upload(request(me, 1, [put(uuidv7(), "v")], { schemaVersion })),
        ).rejects.toMatchObject({
          code: "BAD_REQUEST",
          data: { code: "SYNC_CLIENT_INCOMPATIBLE" },
        });
      }
      expect(await me.client.notes.list()).toEqual([]);
    });

    it("refuses a digest that does not match the operations", async () => {
      const me = await signedIn("digest@example.com");
      await expect(
        me.client.sync.upload(request(me, 1, [put(uuidv7(), "d")], { digest: "0".repeat(64) })),
      ).rejects.toMatchObject({ code: "BAD_REQUEST", data: { code: "SYNC_INVALID_REQUEST" } });
    });

    it("rejects oversize transactions before touching the database", async () => {
      const me = await signedIn("limits@example.com");
      const tooMany = Array.from({ length: 101 }, () => del(uuidv7()));
      expect(await me.client.sync.upload(request(me, 1, tooMany))).toEqual({
        status: "rejected",
        code: "SYNC_LIMIT_EXCEEDED",
        failedIndex: null,
        ops: [],
      });
      const huge = [put(uuidv7(), "t", "x".repeat(70_000))];
      expect(await me.client.sync.upload(request(me, 2, huge))).toMatchObject({
        status: "rejected",
        code: "SYNC_LIMIT_EXCEEDED",
      });
      const receipts = await app.rows(
        sql`SELECT count(*)::int AS n FROM sync_upload_receipts WHERE install_id = ${me.installId}`,
      );
      expect(receipts[0]?.n).toBe(0);
    });

    it("rate limits uploads per user", async () => {
      const limited = await createTestApp();
      try {
        const headers = await createSignedInUser(limited, "limited@example.com");
        const client = limited.client(headers);
        const session = await limited.services.auth.api.getSession({ headers });
        const who = { userId: session?.user.id ?? "", installId: uuidv7() };
        let refused: unknown;
        for (let txId = 1; txId <= 601 && !refused; txId++) {
          await client.sync
            .upload(request(who, txId, [del(uuidv7())]))
            .catch((error) => (refused = error));
        }
        expect(refused).toMatchObject({
          code: "TOO_MANY_REQUESTS",
          data: { code: "SYNC_RATE_LIMITED" },
        });
      } finally {
        await limited.close();
      }
    });

    it("keeps the database CHECK constraints even for direct writes", async () => {
      const me = await signedIn("check@example.com");
      await expect(
        app.rows(
          sql`INSERT INTO notes (id, user_id, title) VALUES (${uuidv7()}, ${me.userId}, ${"😀".repeat(201)}) RETURNING id`,
        ),
      ).rejects.toThrow();
      // 200 code points (400 UTF-16 units) pass SQL but not the JS cap: zod is never looser than SQL.
      const ok = await app.rows(
        sql`INSERT INTO notes (id, user_id, title) VALUES (${uuidv7()}, ${me.userId}, ${"😀".repeat(200)}) RETURNING id`,
      );
      expect(ok).toHaveLength(1);
    });
  });

  describe("purge", () => {
    it("hard-deletes tombstones and receipts past the retention period", async () => {
      const me = await signedIn("purge@example.com");
      const oldId = uuidv7();
      const freshId = uuidv7();
      await me.client.sync.upload(request(me, 1, [put(oldId, "old"), put(freshId, "fresh")]));
      await me.client.sync.upload(request(me, 2, [del(oldId), del(freshId)]));
      await app.rows(
        sql`UPDATE notes SET deleted_at = now() - interval '121 days' WHERE id = ${oldId} RETURNING id`,
      );
      await app.rows(
        sql`UPDATE sync_upload_receipts SET created_at = now() - interval '121 days'
            WHERE user_id = ${me.userId} AND tx_id = 1 RETURNING tx_id`,
      );

      await app.services.jobs.enqueue(syncPurgeQueue, {});
      const deadline = Date.now() + 10_000;
      let remaining = 1;
      while (remaining > 0 && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        const rows = await app.rows(sql`SELECT count(*)::int AS n FROM notes WHERE id = ${oldId}`);
        remaining = Number(rows[0]?.n);
      }
      expect(remaining).toBe(0);
      const fresh = await app.rows(sql`SELECT count(*)::int AS n FROM notes WHERE id = ${freshId}`);
      expect(fresh[0]?.n).toBe(1);
      const receipts = await app.rows(
        sql`SELECT tx_id FROM sync_upload_receipts WHERE user_id = ${me.userId} ORDER BY tx_id`,
      );
      expect(receipts.map((row) => Number(row.tx_id))).toEqual([2]);
    });
  });
});
