import { uuidv7 } from "@workspace/db/columns";
import {
  computeOpsDigest,
  slotSkipId,
  SYNC_SCHEMA_VERSION,
  TRAINING_LIMITS,
  type SyncFailureCode,
  type SyncOp,
  type SyncUploadResult,
} from "@workspace/shared";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createSignedInUser, createTestApp, type TestApp } from "../platform/testing/harness";

const syncOptions = {
  config: {
    sync: {
      endpoint: "http://127.0.0.1:8090",
      slotLag: { warnBytes: 1024 ** 3, criticalBytes: 3 * 1024 ** 3 },
    },
  },
};

describe("program_slot_skip upload handler", () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await createTestApp(syncOptions);
  });
  afterAll(async () => app.close());

  type Client = ReturnType<TestApp["client"]>;
  function installOf(client: Client, userId: string) {
    const installId = uuidv7();
    let txId = 0;
    return {
      userId,
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

  /** A Program with a Workout Slot and a Rest Slot, and a Run on it. */
  async function plan(me: Writer) {
    const ids = {
      program: uuidv7(),
      workout: uuidv7(),
      slot: uuidv7(),
      rest: uuidv7(),
      run: uuidv7(),
    };
    expect(
      await me.send([
        op("PUT", "program", ids.program, { title: "Plan" }),
        op("PUT", "workout", ids.workout, { program_id: ids.program, title: "A" }),
        op("PUT", "program_slot", ids.slot, {
          program_id: ids.program,
          workout_id: ids.workout,
          position: "a0",
        }),
        op("PUT", "program_slot", ids.rest, {
          program_id: ids.program,
          workout_id: null,
          position: "a1",
        }),
        op("PUT", "program_run", ids.run, {
          program_id: ids.program,
          activated_at: new Date().toISOString(),
        }),
      ]),
    ).toEqual(applied);
    return ids;
  }
  const skipData = (run: string, slot: string, cycle = 1) => ({
    run_id: run,
    slot_id: slot,
    cycle,
  });
  const live = async (run: string) =>
    app.rows(
      sql`SELECT id, cycle FROM program_slot_skip WHERE run_id = ${run} AND deleted_at IS NULL`,
    );

  const putSkip = (runId: string, slotId: string, cycle = 1) =>
    op(
      "PUT",
      "program_slot_skip",
      slotSkipId({ runId, slotId, cycle }),
      skipData(runId, slotId, cycle),
    );

  it("acks a missing Undo and reuses the deterministic id after a delete", async () => {
    const me = await writer("skip-basic@example.com");
    const { run, slot } = await plan(me);
    const put = putSkip(run, slot);
    const undo = op("DELETE", "program_slot_skip", put.id);
    expect(await me.send([undo])).toEqual(applied);
    expect(await me.send([put])).toEqual(applied);
    expect(await me.send([putSkip(run.toUpperCase(), slot.toUpperCase())])).toEqual(applied);
    expect(await live(run)).toEqual([{ id: put.id, cycle: 1 }]);
    expect(await me.send([undo])).toEqual(applied);
    expect(await me.send([undo])).toEqual(applied);
    expect(await live(run)).toEqual([]);
    expect(await me.send([put])).toEqual(applied);
    expect(await live(run)).toEqual([{ id: put.id, cycle: 1 }]);
  });

  it("refuses new skips for removed days and finished runs but still takes late Undo", async () => {
    const me = await writer("skip-finished@example.com");
    const { run, slot } = await plan(me);
    const put = putSkip(run, slot);
    expect(await me.send([put])).toEqual(applied);
    expect(await me.send([op("DELETE", "program_slot", slot)])).toEqual(applied);
    expect(await me.send([putSkip(run, slot, 2)])).toMatchObject(
      rejected("RUN_SLOT_PROGRAM_MISMATCH"),
    );
    expect(
      await me.send([
        op("PATCH", "program_run", run, {
          finished_at: new Date().toISOString(),
          outcome: "stopped",
        }),
      ]),
    ).toEqual(applied);
    expect(await me.send([op("DELETE", "program_slot_skip", put.id)])).toEqual(applied);
    expect(await me.send([put])).toMatchObject(rejected("RUN_NOT_FOUND"));
    expect(await live(run)).toEqual([]);
  });

  it("refuses Rest slots, foreign runs and slots, bad cycles and changed rows", async () => {
    const me = await writer("skip-refused@example.com");
    const other = await writer("skip-refused-other@example.com");
    const { run, slot, rest } = await plan(me);
    const theirs = await plan(other);

    expect(await me.send([putSkip(run, rest)])).toMatchObject(rejected("SYNC_INVALID_OP"));
    // Another user's Run is "not found", and so is a Slot of another Program.
    expect(await other.send([putSkip(run, theirs.slot)])).toMatchObject(rejected("RUN_NOT_FOUND"));
    expect(await me.send([putSkip(run, theirs.slot)])).toMatchObject(
      rejected("RUN_SLOT_PROGRAM_MISMATCH"),
    );
    expect(await me.send([putSkip(uuidv7(), slot)])).toMatchObject(rejected("RUN_NOT_FOUND"));
    for (const cycle of [0, -1, 1.5, TRAINING_LIMITS.cycleMax + 1]) {
      expect(
        await me.send([op("PUT", "program_slot_skip", uuidv7(), skipData(run, slot, cycle))]),
      ).toMatchObject(rejected("SYNC_INVALID_OP"));
    }
    expect(
      await me.send([
        op("PUT", "program_slot_skip", uuidv7(), { ...skipData(run, slot), user_id: me.userId }),
      ]),
    ).toMatchObject(rejected("SYNC_INVALID_OP"));
    expect(
      await me.send([
        op("PUT", "program_slot_skip", "00000000-0000-4000-8000-000000000001", skipData(run, slot)),
      ]),
    ).toMatchObject(rejected("SYNC_INVALID_OP"));

    const { id } = putSkip(run, slot);
    expect(await me.send([putSkip(run, slot)])).toEqual(applied);
    expect(await me.send([op("PATCH", "program_slot_skip", id, { cycle: 2 })])).toMatchObject(
      rejected("SYNC_INVALID_OP"),
    );
    expect(
      await me.send([op("PUT", "program_slot_skip", id, skipData(run, slot, 2))]),
    ).toMatchObject(rejected("SYNC_INVALID_OP"));
    // Another user cannot delete or repeat it.
    expect(await other.send([op("DELETE", "program_slot_skip", id)])).toMatchObject(
      rejected("SYNC_ROW_NOT_FOUND"),
    );
    expect(await live(run)).toHaveLength(1);
  });
});
