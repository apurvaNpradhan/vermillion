import { uuidv7 } from "@workspace/db/columns";
import {
  computeOpsDigest,
  SYNC_SCHEMA_VERSION,
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

describe("week phases: program.phase_plan, program_run.inserted_deloads, workout.main_entry_id, training_session.phase", () => {
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
  const rejected = { status: "rejected" };
  const op = (kind: SyncOp["op"], table: string, id: string, opData?: SyncOp["opData"]): SyncOp =>
    opData ? { op: kind, table, id, opData } : { op: kind, table, id };

  const plan = JSON.stringify({
    pattern: ["build", "build", "build", "deload"],
    overrides: [{ week: 6, phase: "test" }],
    modifiers: { deload: { load: 0.85 } },
    test_top: "amrap",
  });
  /** jsonb columns come back as text through the harness; parse them to compare values. */
  const parsed = (value: string | number | boolean | Date | null | undefined) =>
    value === null || value === undefined ? null : JSON.parse(String(value));
  const programRow = (id: string) =>
    app
      .rows(sql`SELECT phase_plan::text AS phase_plan FROM program WHERE id = ${id}`)
      .then((rows) => ({ phase_plan: parsed(rows[0]?.phase_plan) }));

  describe("program.phase_plan", () => {
    it("stores a valid plan on a new Program, and reads back the same object", async () => {
      const me = await writer("phase-put@example.com");
      const id = uuidv7();
      expect(
        await me.send([op("PUT", "program", id, { title: "Plan", phase_plan: plan })]),
      ).toEqual(applied);
      expect((await programRow(id))?.phase_plan).toMatchObject({
        pattern: ["build", "build", "build", "deload"],
        overrides: [{ week: 6, phase: "test" }],
        modifiers: { deload: { load: 0.85 } },
        test_top: "amrap",
      });
    });

    it("fills the plan's defaults", async () => {
      const me = await writer("phase-defaults@example.com");
      const id = uuidv7();
      await me.send([
        op("PUT", "program", id, { title: "Plan", phase_plan: '{"pattern":["push"]}' }),
      ]);
      expect((await programRow(id))?.phase_plan).toEqual({
        pattern: ["push"],
        overrides: [],
        modifiers: {},
        test_top: "single",
      });
    });

    it("starts and stays with no phases when the field is absent or null", async () => {
      const me = await writer("phase-none@example.com");
      const id = uuidv7();
      await me.send([op("PUT", "program", id, { title: "Plan" })]);
      expect((await programRow(id))?.phase_plan).toBeNull();
      await me.send([op("PATCH", "program", id, { phase_plan: plan })]);
      // An older app's PATCH of another field leaves the plan alone.
      expect(await me.send([op("PATCH", "program", id, { title: "Renamed" })])).toEqual(applied);
      expect((await programRow(id))?.phase_plan).not.toBeNull();
      // Null clears it.
      expect(await me.send([op("PATCH", "program", id, { phase_plan: null })])).toEqual(applied);
      expect((await programRow(id))?.phase_plan).toBeNull();
    });

    it.each([
      ["not JSON", "{pattern"],
      ["an empty pattern", '{"pattern":[]}'],
      ["an unknown phase", '{"pattern":["rest"]}'],
      ["a load above 100%", '{"pattern":["build"],"modifiers":{"deload":{"load":1.5}}}'],
      ["a week of 0", '{"pattern":["build"],"overrides":[{"week":0,"phase":"test"}]}'],
      ["an array", '["build"]'],
    ])("refuses %s", async (_name, text) => {
      const me = await writer(`phase-bad-${uuidv7()}@example.com`);
      const id = uuidv7();
      expect(
        await me.send([op("PUT", "program", id, { title: "Plan", phase_plan: text })]),
      ).toMatchObject(rejected);
      await me.send([op("PUT", "program", id, { title: "Plan" })]);
      expect(await me.send([op("PATCH", "program", id, { phase_plan: text })])).toMatchObject(
        rejected,
      );
      expect((await programRow(id))?.phase_plan).toBeNull();
    });

    it("strips a key it does not know instead of refusing the plan", async () => {
      const me = await writer("phase-strip@example.com");
      const id = uuidv7();
      expect(
        await me.send([
          op("PUT", "program", id, {
            title: "Plan",
            phase_plan: '{"pattern":["build"],"extra":1}',
          }),
        ]),
      ).toEqual(applied);
      expect((await programRow(id))?.phase_plan).toEqual({
        pattern: ["build"],
        overrides: [],
        modifiers: {},
        test_top: "single",
      });
    });

    it("lets an older app edit a Program whose stored plan holds a key it does not know", async () => {
      const me = await writer("phase-future@example.com");
      const id = uuidv7();
      await me.send([op("PUT", "program", id, { title: "Plan" })]);
      await app.rows(
        sql`UPDATE program SET phase_plan = '{"pattern":["build"],"future":{"a":1}}'::jsonb WHERE id = ${id}`,
      );
      expect(await me.send([op("PATCH", "program", id, { title: "Renamed" })])).toEqual(applied);
      expect((await programRow(id))?.phase_plan).toMatchObject({ pattern: ["build"] });
    });

    it("keeps the plan through a delete and an undo", async () => {
      const me = await writer("phase-undo@example.com");
      const id = uuidv7();
      await me.send([op("PUT", "program", id, { title: "Plan", phase_plan: plan })]);
      await me.send([op("DELETE", "program", id)]);
      expect(await me.send([op("PUT", "program", id, { title: "Plan", restore: 1 })])).toEqual(
        applied,
      );
      expect((await programRow(id))?.phase_plan).not.toBeNull();
    });

    it("does not let another user write it", async () => {
      const me = await writer("phase-owner@example.com");
      const other = await writer("phase-other@example.com");
      const id = uuidv7();
      await me.send([op("PUT", "program", id, { title: "Plan" })]);
      expect(await other.send([op("PATCH", "program", id, { phase_plan: plan })])).toMatchObject(
        rejected,
      );
      expect((await programRow(id))?.phase_plan).toBeNull();
    });
  });

  describe("program_run.inserted_deloads", () => {
    async function runOf(me: Writer) {
      const program = uuidv7();
      const run = uuidv7();
      await me.send([
        op("PUT", "program", program, { title: "Plan" }),
        op("PUT", "program_run", run, {
          program_id: program,
          activated_at: "2026-11-02T08:00:00.000Z",
        }),
      ]);
      return { program, run };
    }
    const row = (run: string) =>
      app
        .rows(
          sql`SELECT inserted_deloads::text AS inserted_deloads, started_at FROM program_run WHERE id = ${run}`,
        )
        .then((rows) => ({
          inserted_deloads: parsed(rows[0]?.inserted_deloads),
          started_at: rows[0]?.started_at ?? null,
        }));

    it("starts empty, and stores the weeks of an insert", async () => {
      const me = await writer("deload-basic@example.com");
      const { run } = await runOf(me);
      expect((await row(run))?.inserted_deloads).toBeNull();
      expect(await me.send([op("PATCH", "program_run", run, { inserted_deloads: "[3]" })])).toEqual(
        applied,
      );
      expect((await row(run))?.inserted_deloads).toEqual([3]);
    });

    it("unions weeks from two devices and keeps them ascending without repeats", async () => {
      const me = await writer("deload-union@example.com");
      const { run } = await runOf(me);
      await me.send([op("PATCH", "program_run", run, { inserted_deloads: "[5]" })]);
      await me.send([op("PATCH", "program_run", run, { inserted_deloads: "[2,5]" })]);
      expect((await row(run))?.inserted_deloads).toEqual([2, 5]);
    });

    it("leaves the weeks alone when a patch touches another field", async () => {
      const me = await writer("deload-keep@example.com");
      const { run } = await runOf(me);
      await me.send([op("PATCH", "program_run", run, { inserted_deloads: "[2]" })]);
      await me.send([op("PATCH", "program_run", run, { started_at: "2026-11-03T08:00:00.000Z" })]);
      // A patch must not reset the fields it does not carry.
      await me.send([
        op("PATCH", "program_run", run, {
          finished_at: "2026-11-20T08:00:00.000Z",
          outcome: "stopped",
        }),
      ]);
      const after = await row(run);
      expect(after?.inserted_deloads).toEqual([2]);
      expect(after?.started_at).not.toBeNull();
    });

    it("refuses weeks beyond 52 with SYNC_INVALID_OP rather than failing on the database check", async () => {
      const me = await writer("deload-many@example.com");
      const { run } = await runOf(me);
      const fifty2 = Array.from({ length: 52 }, (_, index) => index + 1);
      await app.rows(
        sql`UPDATE program_run SET inserted_deloads = ${JSON.stringify(fifty2)}::jsonb WHERE id = ${run}`,
      );
      expect(
        await me.send([op("PATCH", "program_run", run, { inserted_deloads: "[53]" })]),
      ).toMatchObject({ status: "rejected", code: "SYNC_INVALID_OP" });
      expect((await row(run))?.inserted_deloads).toEqual(fifty2);
      // A week the Run already holds adds nothing.
      expect(
        await me.send([op("PATCH", "program_run", run, { inserted_deloads: "[52]" })]),
      ).toEqual(applied);
    });

    it.each([
      ["not JSON", "[2"],
      ["not ascending", "[5,2]"],
      ["a repeated week", "[2,2]"],
      ["week 0", "[0]"],
      ["not numbers", '["a"]'],
      ["an object", "{}"],
    ])("refuses %s", async (_name, text) => {
      const me = await writer(`deload-bad-${uuidv7()}@example.com`);
      const { run } = await runOf(me);
      expect(
        await me.send([op("PATCH", "program_run", run, { inserted_deloads: text })]),
      ).toMatchObject(rejected);
      expect((await row(run))?.inserted_deloads).toBeNull();
    });
  });

  describe("workout.main_entry_id", () => {
    const mainOf = (id: string) =>
      app.rows(sql`SELECT main_entry_id FROM workout WHERE id = ${id}`).then((r) => r[0]);

    it("stores and clears the main lift, and a PATCH of another field leaves it", async () => {
      const me = await writer("main-lift@example.com");
      const id = uuidv7();
      const entry = uuidv7();
      expect(await me.send([op("PUT", "workout", id, { title: "Push A" })])).toEqual(applied);
      expect((await mainOf(id))?.main_entry_id).toBeNull();
      expect(await me.send([op("PATCH", "workout", id, { main_entry_id: entry })])).toEqual(
        applied,
      );
      expect((await mainOf(id))?.main_entry_id).toBe(entry);
      await me.send([op("PATCH", "workout", id, { title: "Push B" })]);
      expect((await mainOf(id))?.main_entry_id).toBe(entry);
      await me.send([op("PATCH", "workout", id, { main_entry_id: null })]);
      expect((await mainOf(id))?.main_entry_id).toBeNull();
    });

    it("refuses an id that is not a UUID", async () => {
      const me = await writer("main-bad@example.com");
      const id = uuidv7();
      await me.send([op("PUT", "workout", id, { title: "Push A" })]);
      expect(await me.send([op("PATCH", "workout", id, { main_entry_id: "first" })])).toMatchObject(
        rejected,
      );
    });
  });

  describe("training_session.phase", () => {
    const sessionData = (phase?: string | null) => ({
      title: "Push A",
      started_at: new Date().toISOString(),
      device_id: uuidv7(),
      ...(phase === undefined ? {} : { phase }),
    });
    const phaseOf = (id: string) =>
      app.rows(sql`SELECT phase FROM training_session WHERE id = ${id}`).then((r) => r[0]);

    it.each(["build", "push", "test", "deload"])("records %s at start", async (phase) => {
      const me = await writer(`session-${phase}@example.com`);
      const id = uuidv7();
      expect(await me.send([op("PUT", "training_session", id, sessionData(phase))])).toEqual(
        applied,
      );
      expect((await phaseOf(id))?.phase).toBe(phase);
    });

    it("is null for a Session from an older app, and survives a later patch", async () => {
      const me = await writer("session-old@example.com");
      const id = uuidv7();
      await me.send([op("PUT", "training_session", id, sessionData())]);
      expect((await phaseOf(id))?.phase).toBeNull();
      const withPhase = uuidv7();
      await me.send([op("PUT", "training_session", withPhase, sessionData("deload"))]);
      await me.send([
        op("PATCH", "training_session", withPhase, { finished_at: new Date().toISOString() }),
      ]);
      expect((await phaseOf(withPhase))?.phase).toBe("deload");
    });

    it("stores the modifiers it started with, and keeps them through a patch", async () => {
      const me = await writer("session-snapshot@example.com");
      const id = uuidv7();
      const snapshot = { sets: 0.5, rpe: -2, load: 0.9, test_top: "single" };
      await me.send([
        op("PUT", "training_session", id, {
          ...sessionData("deload"),
          phase_modifiers: JSON.stringify(snapshot),
        }),
      ]);
      await me.send([
        op("PATCH", "training_session", id, { finished_at: new Date().toISOString() }),
      ]);
      const [stored] = await app.rows(
        sql`SELECT phase_modifiers::text AS phase_modifiers FROM training_session WHERE id = ${id}`,
      );
      expect(parsed(stored?.phase_modifiers)).toEqual(snapshot);
    });

    it("refuses modifiers it cannot read", async () => {
      const me = await writer("session-snapshot-bad@example.com");
      const id = uuidv7();
      expect(
        await me.send([
          op("PUT", "training_session", id, {
            ...sessionData("deload"),
            phase_modifiers: '{"sets":9}',
          }),
        ]),
      ).toMatchObject(rejected);
    });

    it("refuses a phase it does not know", async () => {
      const me = await writer("session-bad@example.com");
      const id = uuidv7();
      expect(
        await me.send([op("PUT", "training_session", id, sessionData("recovery"))]),
      ).toMatchObject(rejected);
    });
  });
});
