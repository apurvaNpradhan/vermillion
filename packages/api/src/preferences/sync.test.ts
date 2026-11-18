import { uuidv7 } from "@workspace/db/columns";
import {
  computeOpsDigest,
  SYNC_SCHEMA_VERSION,
  type SyncOp,
  type UpdatePreferences,
} from "@workspace/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createSignedInUser, createTestApp, type TestApp } from "../platform/testing/harness";

type PatchBody = UpdatePreferences & { writtenAt?: string };

describe("preferences uploads", () => {
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
      client,
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
    };
  }
  const table = "user_preferences";

  it("creates the user's row from a device's first write and merges later ones key by key", async () => {
    const a = await writer();
    expect(
      await a.send([
        {
          op: "PUT",
          table,
          id: uuidv7(),
          opData: { locale: null, timezone: "Europe/Berlin", ui: '{"weightUnit":"lb"}' },
        },
      ]),
    ).toMatchObject({ status: "applied" });
    // Another device made a row with another id: it merges into the same single row.
    expect(
      await a.send([{ op: "PUT", table, id: uuidv7(), opData: { ui: '{"keepAwake":false}' } }]),
    ).toMatchObject({ status: "applied" });
    expect(await a.client.preferences.get()).toMatchObject({
      timezone: "Europe/Berlin",
      ui: { weightUnit: "lb", keepAwake: false },
    });
  });

  it("applies a patch of only the changed columns", async () => {
    const a = await writer();
    const id = uuidv7();
    await a.send([{ op: "PUT", table, id, opData: { ui: '{"weightUnit":"lb"}' } }]);
    expect(
      await a.send([
        { op: "PATCH", table, id, opData: { ui: '{"weightUnit":"lb","sounds":false}' } },
      ]),
    ).toMatchObject({ status: "applied" });
    expect((await a.client.preferences.get()).ui).toMatchObject({
      weightUnit: "lb",
      sounds: false,
    });
  });

  it("reads a dirty-key patch: only the keys it names change, and an explicit null clears", async () => {
    const a = await writer();
    await a.client.preferences.update({
      timezone: "Europe/Berlin",
      locale: "en",
      ui: { weightUnit: "lb", sounds: false },
    });
    const patch = (value: PatchBody) => ({ patch: JSON.stringify(value) });
    // The first insert of a new row: PowerSync omits NULL columns, the patch carries the null.
    expect(
      await a.send([
        {
          op: "PUT",
          table,
          id: uuidv7(),
          opData: patch({ timezone: null, ui: { keepAwake: false }, writtenAt: "2026-11-18" }),
        },
      ]),
    ).toMatchObject({ status: "applied" });
    expect(await a.client.preferences.get()).toMatchObject({
      timezone: null,
      locale: "en",
      ui: { weightUnit: "lb", sounds: false, keepAwake: false },
    });
    // Other columns beside a patch are ignored: the patch is the whole truth of that write.
    await a.send([
      {
        op: "PATCH",
        table,
        id: uuidv7(),
        opData: { ...patch({ ui: { sounds: true } }), ui: '{"weightUnit":"kg"}' },
      },
    ]);
    expect((await a.client.preferences.get()).ui).toMatchObject({
      weightUnit: "lb",
      sounds: true,
    });
    expect(
      await a.send([{ op: "PUT", table, id: uuidv7(), opData: { patch: "nope" } }]),
    ).toMatchObject({ code: "SYNC_INVALID_OP" });
    expect(
      await a.send([
        { op: "PUT", table, id: uuidv7(), opData: patch({ ui: { defaultRestSeconds: -1 } }) },
      ]),
    ).toMatchObject({ code: "SYNC_INVALID_OP" });
  });

  it("merges per-muscle goal edits so another device's muscle survives, and null resets one", async () => {
    const a = await writer();
    const patch = (value: PatchBody) => ({ patch: JSON.stringify(value) });
    const grow = { level: "grow" } as const;
    const push = { level: "custom", min: 12, max: 18 } as const;
    // Device 1 and device 2 each edit another muscle from the same stale view.
    await a.send([
      {
        op: "PUT",
        table,
        id: uuidv7(),
        opData: patch({ muscleGoalChanges: { chest: push }, writtenAt: "1" }),
      },
    ]);
    await a.send([
      {
        op: "PUT",
        table,
        id: uuidv7(),
        opData: patch({ muscleGoalChanges: { quadriceps: grow }, writtenAt: "2" }),
      },
    ]);
    expect((await a.client.preferences.get()).ui.muscleGoals).toEqual({
      chest: push,
      quadriceps: grow,
    });
    // An explicit null resets only that muscle.
    await a.send([
      {
        op: "PATCH",
        table,
        id: uuidv7(),
        opData: patch({ muscleGoalChanges: { chest: null }, writtenAt: "3" }),
      },
    ]);
    expect((await a.client.preferences.get()).ui.muscleGoals).toEqual({ quadriceps: grow });
    // The legacy whole-map upload keeps its overwrite behaviour.
    await a.send([
      {
        op: "PATCH",
        table,
        id: uuidv7(),
        opData: { ui: JSON.stringify({ muscleGoals: { calves: grow } }) },
      },
    ]);
    expect((await a.client.preferences.get()).ui.muscleGoals).toEqual({ calves: grow });
    expect(
      await a.send([
        {
          op: "PUT",
          table,
          id: uuidv7(),
          opData: patch({ muscleGoalChanges: { chest: { level: "bogus" } } } as never),
        },
      ]),
    ).toMatchObject({ code: "SYNC_INVALID_OP" });
  });

  it("refuses deletes, values the old procedure refuses, and a foreign avatar", async () => {
    const a = await writer();
    const id = uuidv7();
    expect(await a.send([{ op: "DELETE", table, id }])).toMatchObject({
      status: "rejected",
      code: "SYNC_INVALID_OP",
    });
    expect(
      await a.send([{ op: "PUT", table, id, opData: { ui: '{"defaultRestSeconds":-1}' } }]),
    ).toMatchObject({ code: "SYNC_INVALID_OP" });
    expect(await a.send([{ op: "PUT", table, id, opData: { ui: "nope" } }])).toMatchObject({
      code: "SYNC_INVALID_OP",
    });
    expect(
      await a.send([{ op: "PUT", table, id, opData: { ui: `{"avatarMediaId":"${uuidv7()}"}` } }]),
    ).toMatchObject({ code: "MEDIA_REFERENCE_INVALID" });
  });

  it("keeps the older procedure and the synced row in step", async () => {
    const a = await writer();
    await a.client.preferences.update({ ui: { weightUnit: "lb" } });
    await a.send([{ op: "PUT", table, id: uuidv7(), opData: { ui: '{"sounds":false}' } }]);
    expect((await a.client.preferences.get()).ui).toMatchObject({
      weightUnit: "lb",
      sounds: false,
    });
  });
});
