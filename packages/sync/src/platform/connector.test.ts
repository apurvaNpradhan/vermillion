import { ORPCError } from "@orpc/client";
import { SYNC_SCHEMA_VERSION, computeOpsDigest, type SyncUploadRequest } from "@workspace/shared";
import { beforeEach, describe, expect, it } from "vitest";

import { crudEntry, createFakeDatabase } from "./fake-database";
import { claimDeviceOwner } from "./device-owner";
import { ensureInstallId } from "./install-meta";
import { uploadColumns } from "./upload-columns";
import { createConnector, SyncUploadError, type ConnectorSignal } from "./connector";
import type { SyncTransport } from "./transport";

const OWNER = "user-owner";
const NOTE = "01900000-0000-7000-8000-000000000001";

type Upload = SyncTransport["upload"];

function setup(
  options: { upload?: Upload; credentialsUserId?: string; beforeComplete?: () => void } = {},
) {
  const fake = createFakeDatabase(
    options.beforeComplete ? { beforeComplete: options.beforeComplete } : {},
  );
  const uploads: SyncUploadRequest[] = [];
  const signals: ConnectorSignal[] = [];
  const transport: SyncTransport = {
    credentials: async () => ({
      endpoint: "https://sync.example.test",
      token: "jwt",
      userId: options.credentialsUserId ?? OWNER,
      expiresAt: new Date(Date.UTC(2030, 0, 1, 0, 5, 0)).toISOString(),
    }),
    upload: async (request) => {
      uploads.push(request);
      return options.upload ? options.upload(request) : { status: "applied" };
    },
  };
  const connector = createConnector({
    database: fake.database,
    transport,
    onSignal: (signal) => signals.push(signal),
    uploadColumns,
  });
  return { ...fake, connector, uploads, signals };
}

async function ready(fake: ReturnType<typeof setup>) {
  await claimDeviceOwner(fake.database, OWNER);
  return ensureInstallId(fake.database);
}

const rejectedRows = (fake: ReturnType<typeof setup>) =>
  fake.sqlite.prepare("SELECT * FROM rejected_writes ORDER BY op_ordinal").all();

describe("fetchCredentials", () => {
  it("returns the endpoint and token, renewing before the token's own expiry", async () => {
    const fake = setup();
    await ready(fake);
    const credentials = await fake.connector.fetchCredentials();
    expect(credentials).toMatchObject({ endpoint: "https://sync.example.test", token: "jwt" });
    // Reported expiry is the real one minus the 60 second renewal margin.
    expect(credentials.expiresAt?.toISOString()).toBe("2030-01-01T00:04:00.000Z");
  });

  it("refuses another account's credentials and signals it", async () => {
    const fake = setup({ credentialsUserId: "someone-else" });
    await ready(fake);
    await expect(fake.connector.fetchCredentials()).rejects.toMatchObject({
      kind: "wrong-account",
    });
    expect(fake.signals).toEqual(["wrong-account"]);
  });

  it("refuses to connect a database nobody owns", async () => {
    const fake = setup();
    await expect(fake.connector.fetchCredentials()).rejects.toBeInstanceOf(SyncUploadError);
  });

  it("signals a lost session on 401 and keeps everything else quiet on network errors", async () => {
    const fake = setup();
    await ready(fake);
    const failing = createConnector({
      database: fake.database,
      transport: {
        credentials: async () => {
          throw new ORPCError("UNAUTHORIZED");
        },
        upload: async () => ({ status: "applied" }),
      },
      onSignal: (signal) => fake.signals.push(signal),
      uploadColumns,
    });
    await expect(failing.fetchCredentials()).rejects.toMatchObject({ kind: "unauthorized" });
    expect(fake.signals).toEqual(["unauthorized"]);

    const offline = createConnector({
      database: fake.database,
      transport: {
        credentials: async () => {
          throw new TypeError("fetch failed");
        },
        upload: async () => ({ status: "applied" }),
      },
      onSignal: (signal) => fake.signals.push(signal),
      uploadColumns,
    });
    await expect(offline.fetchCredentials()).rejects.toMatchObject({ kind: "transient" });
    expect(fake.signals).toEqual(["unauthorized"]);
  });
});

describe("uploadData", () => {
  let fake: ReturnType<typeof setup>;
  beforeEach(() => {
    fake = setup();
  });

  it("does nothing with an empty queue", async () => {
    await ready(fake);
    await fake.connector.uploadData();
    expect(fake.uploads).toEqual([]);
  });

  it("sends the contract request and completes the transaction on success", async () => {
    const installId = await ready(fake);
    fake.queue(
      [
        crudEntry("PUT", NOTE, {
          user_id: OWNER,
          title: "Hello",
          body: "",
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
          deleted_at: null,
        }),
      ],
      7,
    );
    await fake.connector.uploadData();

    // Server-owned columns never go on the wire.
    const ops = [{ op: "PUT", table: "notes", id: NOTE, opData: { title: "Hello", body: "" } }];
    expect(fake.uploads).toEqual([
      {
        userId: OWNER,
        installId,
        txId: 7,
        schemaVersion: SYNC_SCHEMA_VERSION,
        digest: computeOpsDigest(ops as never),
        ops,
      },
    ]);
    expect(fake.state.completed).toEqual([7]);
    expect(fake.pendingTransactions()).toBe(0);
  });

  it("completes without a request when only server-owned columns changed", async () => {
    await ready(fake);
    fake.queue([crudEntry("PATCH", NOTE, { updated_at: "2026-01-02T00:00:00.000Z" })], 3);
    await fake.connector.uploadData();
    expect(fake.uploads).toEqual([]);
    expect(fake.state.completed).toEqual([3]);
  });

  it("sends a DELETE without data", async () => {
    await ready(fake);
    fake.queue([crudEntry("DELETE", NOTE)], 4);
    await fake.connector.uploadData();
    expect(fake.uploads[0]?.ops).toEqual([{ op: "DELETE", table: "notes", id: NOTE }]);
  });

  it("stores a permanent rejection durably before completing, per operation", async () => {
    let storedAtCompletion = -1;
    const rejecting = setup({
      upload: async () => ({
        status: "rejected",
        code: "SYNC_CONSTRAINT_VIOLATION",
        failedIndex: 1,
        ops: ["SYNC_TRANSACTION_ROLLED_BACK", "SYNC_CONSTRAINT_VIOLATION"],
      }),
      // The rows must already be there when the transaction is completed.
      beforeComplete: () => {
        storedAtCompletion = Number(
          rejecting.sqlite.prepare("SELECT COUNT(*) AS n FROM rejected_writes").get()?.["n"],
        );
      },
    });
    await ready(rejecting);
    const OTHER = "01900000-0000-7000-8000-000000000002";
    rejecting.queue(
      [crudEntry("PATCH", NOTE, { title: "ok" }), crudEntry("PATCH", OTHER, { title: "" })],
      9,
    );
    await rejecting.connector.uploadData();

    expect(storedAtCompletion).toBe(2);
    expect(rejectedRows(rejecting)).toMatchObject([
      {
        id: "9:0",
        tx_id: "9",
        op_ordinal: 0,
        table_name: "notes",
        row_id: NOTE,
        op: "PATCH",
        code: "SYNC_TRANSACTION_ROLLED_BACK",
        payload: '{"title":"ok"}',
        payload_truncated: 0,
        schema_version: SYNC_SCHEMA_VERSION,
      },
      { id: "9:1", op_ordinal: 1, row_id: OTHER, code: "SYNC_CONSTRAINT_VIOLATION" },
    ]);
    expect(rejecting.pendingTransactions()).toBe(0);
  });

  it("does not store a rejection twice when the transaction comes back", async () => {
    const rejecting = setup({
      upload: async () => ({
        status: "rejected",
        code: "SYNC_ROW_DELETED",
        failedIndex: 0,
        ops: ["SYNC_ROW_DELETED"],
      }),
    });
    await ready(rejecting);
    rejecting.queue([crudEntry("PATCH", NOTE, { title: "x" })], 5);
    await rejecting.connector.uploadData();
    // complete() was lost: the same transaction is offered again.
    rejecting.queue([crudEntry("PATCH", NOTE, { title: "x" })], 5);
    await rejecting.connector.uploadData();
    expect(rejectedRows(rejecting)).toHaveLength(1);
  });

  it("truncates a huge rejected payload", async () => {
    const rejecting = setup({
      upload: async () => ({
        status: "rejected",
        code: "SYNC_LIMIT_EXCEEDED",
        failedIndex: null,
        ops: [],
      }),
    });
    await ready(rejecting);
    rejecting.queue([crudEntry("PUT", NOTE, { title: "t", body: "x".repeat(40_000) })], 6);
    await rejecting.connector.uploadData();
    const [row] = rejectedRows(rejecting);
    expect(row).toMatchObject({ payload_truncated: 1, code: "SYNC_LIMIT_EXCEEDED" });
    expect(String(row?.["payload"]).length).toBeLessThanOrEqual(16 * 1024);
  });

  it("rejects an oversize transaction locally without sending it", async () => {
    await ready(fake);
    fake.queue([crudEntry("PUT", NOTE, { title: "t", body: "x".repeat(70_000) })], 8);
    await fake.connector.uploadData();
    expect(fake.uploads).toEqual([]);
    expect(rejectedRows(fake)).toMatchObject([{ code: "SYNC_LIMIT_EXCEEDED" }]);
    expect(fake.state.completed).toEqual([8]);
  });

  describe("outcomes that keep the queue", () => {
    const refusal = (
      code: "UNAUTHORIZED" | "CONFLICT" | "BAD_REQUEST" | "TOO_MANY_REQUESTS" | "BAD_GATEWAY",
      syncCode?: string,
    ) => (syncCode ? new ORPCError(code, { data: { code: syncCode } }) : new ORPCError(code));

    const cases = [
      { name: "401", error: refusal("UNAUTHORIZED"), kind: "unauthorized", signal: "unauthorized" },
      {
        name: "wrong account",
        error: refusal("CONFLICT", "SYNC_WRONG_ACCOUNT"),
        kind: "wrong-account",
        signal: "wrong-account",
      },
      {
        name: "incompatible client",
        error: refusal("BAD_REQUEST", "SYNC_CLIENT_INCOMPATIBLE"),
        kind: "incompatible",
        signal: "update-required",
      },
      {
        name: "rate limit",
        error: refusal("TOO_MANY_REQUESTS", "SYNC_RATE_LIMITED"),
        kind: "rate-limited",
        signal: undefined,
      },
      {
        name: "transient",
        error: refusal("BAD_GATEWAY", "SYNC_TRANSIENT"),
        kind: "transient",
        signal: undefined,
      },
      {
        name: "lost connection",
        error: new TypeError("fetch failed"),
        kind: "transient",
        signal: undefined,
      },
      {
        name: "replay mismatch",
        error: refusal("CONFLICT", "SYNC_REPLAY_MISMATCH"),
        kind: "client-fault",
        signal: undefined,
      },
    ] as const;

    it.each(cases)("$name throws, signals and never completes or clears", async (item) => {
      const failing = setup({
        upload: async () => {
          throw item.error;
        },
      });
      await ready(failing);
      failing.queue([crudEntry("PATCH", NOTE, { title: "keep me" })], 11);
      await expect(failing.connector.uploadData()).rejects.toMatchObject({ kind: item.kind });
      expect(failing.signals).toEqual(item.signal ? [item.signal] : []);
      expect(failing.pendingTransactions()).toBe(1);
      expect(failing.state.completed).toEqual([]);
      expect(failing.state.clears).toBe(0);
      expect(rejectedRows(failing)).toEqual([]);
    });
  });
});
