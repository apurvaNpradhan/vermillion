import { ORPCError } from "@orpc/client";
import { SYNC_SCHEMA_VERSION, computeOpsDigest, type SyncUploadRequest } from "@workspace/shared";
import { beforeEach, describe, expect, it } from "vitest";

import { crudEntry, createFakeDatabase } from "./fake-database";
import { claimDeviceOwner } from "./device-owner";
import { ensureInstallId } from "./install-meta";
import { legacyUploadColumns, uploadColumns } from "./upload-columns";
import { createConnector, SyncUploadError, type ConnectorSignal } from "./connector";
import type { SyncTransport } from "./transport";

const OWNER = "user-owner";
const EXERCISE = "01900000-0000-7000-8000-000000000001";

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
    legacyUploadColumns,
  });
  return { ...fake, connector, uploads, signals };
}

async function ready(fake: ReturnType<typeof setup>) {
  await claimDeviceOwner(fake.database, OWNER);
  return ensureInstallId(fake.database);
}

const rejectedRows = (fake: ReturnType<typeof setup>) =>
  fake.sqlite.prepare("SELECT * FROM rejected_writes ORDER BY op_ordinal").all();

it("uploads the completion state PowerSync recorded when a set was deleted", async () => {
  const fake = setup();
  await ready(fake);
  const tracked = crudEntry("DELETE", EXERCISE, undefined, "session_set");
  tracked.previousValues = { completed_at: null };
  fake.queue([tracked]);

  await fake.connector.uploadData();

  expect(fake.uploads[0]?.ops).toEqual([
    { op: "DELETE", table: "session_set", id: EXERCISE, expect: { completed_at: null } },
  ]);
});

it("sends a deload's intent without the device's stale list", async () => {
  const fake = setup();
  await ready(fake);
  const undo = crudEntry("PATCH", EXERCISE, { inserted_deloads: "[]" }, "program_run");
  undo.metadata = '{"action":"undo","week":3,"timezone":"America/Los_Angeles"}';
  fake.queue([undo]);
  await fake.connector.uploadData();
  expect(fake.uploads[0]?.ops).toEqual([
    { op: "PATCH", table: "program_run", id: EXERCISE, opData: { deload_change: undo.metadata } },
  ]);
});

it("uploads the equipment list a gym toggle started from", async () => {
  const fake = setup();
  await ready(fake);
  const gym = crudEntry("PATCH", EXERCISE, { unavailable_equipment: '["cable"]' }, "gym");
  gym.previousValues = { unavailable_equipment: "[]" };
  fake.queue([gym]);

  await fake.connector.uploadData();

  expect(fake.uploads[0]?.ops).toEqual([
    {
      op: "PATCH",
      table: "gym",
      id: EXERCISE,
      opData: { unavailable_equipment: '["cable"]' },
      expect: { unavailable_equipment: "[]" },
    },
  ]);
});

it("uploads a resume with its baseline and leaves derived timer shifts to the server", async () => {
  const fake = setup();
  await ready(fake);
  const pausedAt = "2026-11-23T10:00:00.000Z";
  const session = crudEntry(
    "PATCH",
    EXERCISE,
    { paused_at: null, paused_ms: 9000 },
    "training_session",
  );
  session.previousValues = { paused_at: pausedAt, paused_ms: 5000, finished_at: null };
  const timer = crudEntry("PATCH", EXERCISE, { timer_started_at: pausedAt }, "session_set");
  timer.previousValues = { timer_started_at: "2026-11-23T09:59:56.000Z" };
  const tick = crudEntry("PATCH", EXERCISE, { completed_at: pausedAt }, "session_set");
  fake.queue([session, ...Array.from({ length: 100 }, () => timer), tick]);

  await fake.connector.uploadData();

  expect(fake.uploads[0]?.ops).toEqual([
    {
      op: "PATCH",
      table: "training_session",
      id: EXERCISE,
      opData: { paused_at: null, paused_ms: 9000 },
      expect: { paused_at: pausedAt, paused_ms: 5000 },
    },
    { op: "PATCH", table: "session_set", id: EXERCISE, opData: { completed_at: pausedAt } },
  ]);
});

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
        crudEntry("PUT", EXERCISE, {
          user_id: OWNER,
          title: "Hello",
          instructions: "",
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
          retired_at: null,
        }),
      ],
      7,
    );
    await fake.connector.uploadData();

    // Server-owned columns never go on the wire.
    const ops = [
      {
        op: "PUT",
        table: "exercise",
        id: EXERCISE,
        opData: { title: "Hello", instructions: "", retired_at: null },
      },
    ];
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
    fake.queue([crudEntry("PATCH", EXERCISE, { updated_at: "2026-01-02T00:00:00.000Z" })], 3);
    await fake.connector.uploadData();
    expect(fake.uploads).toEqual([]);
    expect(fake.state.completed).toEqual([3]);
  });

  it("sends a DELETE without data", async () => {
    await ready(fake);
    fake.queue([crudEntry("DELETE", EXERCISE)], 4);
    await fake.connector.uploadData();
    expect(fake.uploads[0]?.ops).toEqual([{ op: "DELETE", table: "exercise", id: EXERCISE }]);
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
      [crudEntry("PATCH", EXERCISE, { title: "ok" }), crudEntry("PATCH", OTHER, { title: "" })],
      9,
    );
    await rejecting.connector.uploadData();

    expect(storedAtCompletion).toBe(2);
    expect(rejectedRows(rejecting)).toMatchObject([
      {
        id: "9:0",
        tx_id: "9",
        op_ordinal: 0,
        table_name: "exercise",
        row_id: EXERCISE,
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
    rejecting.queue([crudEntry("PATCH", EXERCISE, { title: "x" })], 5);
    await rejecting.connector.uploadData();
    // complete() was lost: the same transaction is offered again.
    rejecting.queue([crudEntry("PATCH", EXERCISE, { title: "x" })], 5);
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
    rejecting.queue(
      [crudEntry("PUT", EXERCISE, { title: "t", instructions: "x".repeat(40_000) })],
      6,
    );
    await rejecting.connector.uploadData();
    const [row] = rejectedRows(rejecting);
    expect(row).toMatchObject({ payload_truncated: 1, code: "SYNC_LIMIT_EXCEEDED" });
    expect(String(row?.["payload"]).length).toBeLessThanOrEqual(16 * 1024);
  });

  it("rejects an oversize transaction locally without sending it", async () => {
    await ready(fake);
    fake.queue([crudEntry("PUT", EXERCISE, { title: "t", instructions: "x".repeat(70_000) })], 8);
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
        name: "server rolled back to schema version 1",
        error: new ORPCError("BAD_REQUEST", {
          data: { code: "SYNC_CLIENT_INCOMPATIBLE", minSchemaVersion: 1, maxSchemaVersion: 1 },
        }),
        kind: "incompatible",
        signal: "update-required",
      },
      {
        name: "server requires a newer client",
        error: new ORPCError("BAD_REQUEST", {
          data: { code: "SYNC_CLIENT_INCOMPATIBLE", minSchemaVersion: 3, maxSchemaVersion: 3 },
        }),
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
      failing.queue([crudEntry("PATCH", EXERCISE, { title: "keep me" })], 11);
      await expect(failing.connector.uploadData()).rejects.toMatchObject({ kind: item.kind });
      expect(failing.signals).toEqual(item.signal ? [item.signal] : []);
      expect(failing.pendingTransactions()).toBe(1);
      expect(failing.state.completed).toEqual([]);
      expect(failing.state.clears).toBe(0);
      expect(rejectedRows(failing)).toEqual([]);
    });
  });
});

describe("queued preferences written before the patch column", () => {
  const PREFS = "01900000-0000-7000-8000-0000000000aa";

  it("uploads a legacy PATCH with its original columns and digest", async () => {
    const fake = setup();
    await ready(fake);
    fake.queue(
      [crudEntry("PATCH", PREFS, { ui: '{"weightUnit":"lb"}', locale: null }, "user_preferences")],
      20,
    );
    await fake.connector.uploadData();
    expect(fake.uploads).toHaveLength(1);
    const [request] = fake.uploads;
    expect(request?.ops[0]).toMatchObject({
      op: "PATCH",
      opData: { ui: '{"weightUnit":"lb"}', locale: null },
    });
    expect(request?.digest).toBe(computeOpsDigest(request?.ops ?? []));
    expect(fake.state.completed).toEqual([20]);
  });

  it("keeps a legacy PUT's columns, and sends a new write as its patch only", async () => {
    const fake = setup();
    await ready(fake);
    fake.queue(
      [
        crudEntry(
          "PUT",
          PREFS,
          { user_id: OWNER, ui: '{"keepAwake":false}', created_at: "2026-01-01T00:00:00.000Z" },
          "user_preferences",
        ),
      ],
      21,
    );
    fake.queue(
      [
        crudEntry(
          "PATCH",
          PREFS,
          { ui: '{"keepAwake":true}', patch: '{"ui":{"keepAwake":true}}' },
          "user_preferences",
        ),
      ],
      22,
    );
    await fake.connector.uploadData();
    await fake.connector.uploadData();
    expect(fake.uploads[0]?.ops[0]?.opData).toEqual({ ui: '{"keepAwake":false}' });
    expect(fake.uploads[1]?.ops[0]?.opData).toEqual({ patch: '{"ui":{"keepAwake":true}}' });
  });
});

it.each([
  { first: "kg", second: "lb" },
  { first: "lb", second: "kg" },
])(
  "uploads setting the unit to $first, changing to $second and clearing it across two devices",
  async ({ first, second }) => {
    const one = setup();
    const two = setup();
    expect(await ready(one)).not.toBe(await ready(two));

    for (const [device, txId, op, fields] of [
      [one, 1, "PUT", { exercise_id: EXERCISE, unit: first }],
      [two, 1, "PATCH", { unit: second }],
      [one, 2, "PATCH", { unit: null }],
    ] as const) {
      device.queue([crudEntry(op, EXERCISE, fields, "exercise_setting")], txId);
      await device.connector.uploadData();
      expect(device.uploads.at(-1)?.ops).toEqual([
        { op, table: "exercise_setting", id: EXERCISE, opData: fields },
      ]);
    }
  },
);
