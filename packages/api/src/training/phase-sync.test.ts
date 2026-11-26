import { uuidv7 } from "@workspace/db/columns";
import {
  computeOpsDigest,
  SYNC_SCHEMA_VERSION,
  type SyncOp,
  type SyncUploadResult,
} from "@workspace/shared";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { bundledCatalogText } from "../exercise/operations/bundled-catalog";
import { seedCatalog } from "../exercise/operations/seed-catalog";
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
    return { ...installOf(client, userId), anotherDevice: () => installOf(client, userId) };
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

    it("validates and merges pause intervals without reopening a resumed Run", async () => {
      const me = await writer("run-pauses@example.com");
      const other = await writer("run-pauses-other@example.com");
      const { run } = await runOf(me);
      const pausesOf = async () => {
        const [stored] = await app.rows(
          sql`SELECT pauses::text AS pauses FROM program_run WHERE id = ${run}`,
        );
        return parsed(stored?.pauses);
      };
      const from = "2026-11-06T08:00:00Z";
      const until = "2026-11-20T08:00:00Z";
      const stale = { from, until: null };
      const second = { from: "2026-11-22T08:00:00Z", until: null };
      const change = (value: { from: string } | { from: string; until: string | null }[]) =>
        op("PATCH", "program_run", run, { pauses: JSON.stringify(value) });
      expect(await pausesOf()).toBeNull();
      expect(await other.send([change([stale])])).toMatchObject(rejected);
      expect(await me.send([change([stale])])).toEqual(applied);
      expect(await me.send([change([{ from, until }])])).toEqual(applied);
      expect(await me.send([change([stale, second])])).toEqual(applied);
      expect(await me.send([op("PATCH", "program_run", run, { inserted_deloads: "[3]" })])).toEqual(
        applied,
      );
      expect(await pausesOf()).toEqual([{ from, until }, second]);
      for (const invalid of [[{ from: until, until: from }], [stale, stale], { from }]) {
        expect(await me.send([change(invalid)])).toMatchObject(rejected);
      }
      expect(await pausesOf()).toEqual([{ from, until }, second]);
    });

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

    const change = (run: string, action: "insert" | "undo", week: number, timezone = "UTC") =>
      op("PATCH", "program_run", run, {
        deload_change: JSON.stringify({ action, week, ...(action === "undo" ? { timezone } : {}) }),
      });

    it.each([true, false])(
      "merges an offline insert and undo (insert first: %s)",
      async (insertFirst) => {
        const me = await writer(`deload-order-${insertFirst}@example.com`);
        const device = me.anotherDevice();
        const { run } = await runOf(me);
        await me.send([change(run, "insert", 3)]);
        const insert = () => device.send([change(run, "insert", 5)]);
        const undo = () => me.send([change(run, "undo", 3)]);
        expect(await (insertFirst ? insert() : undo())).toEqual(applied);
        expect(await (insertFirst ? undo() : insert())).toEqual(applied);
        expect((await row(run)).inserted_deloads).toEqual([5]);

        // An old client can add week 7, but its stale knowledge of week 3 cannot bring it back.
        const legacy = me.anotherDevice();
        expect(
          await legacy.send([op("PATCH", "program_run", run, { inserted_deloads: "[3,7]" })]),
        ).toEqual(applied);
        expect(
          await legacy.send([op("PATCH", "program_run", run, { inserted_deloads: "[7]" })]),
        ).toEqual(applied);
        expect((await row(run)).inserted_deloads).toEqual([5, 7]);
        // A deliberate new insert is allowed.
        expect(await me.send([change(run, "insert", 3)])).toEqual(applied);
        expect((await row(run)).inserted_deloads).toEqual([3, 5, 7]);
      },
    );

    it("allows only the owner to undo an inserted week", async () => {
      const me = await writer("deload-undo@example.com");
      const other = await writer("deload-undo-other@example.com");
      const { run } = await runOf(me);
      await me.send([change(run, "insert", 2)]);
      expect(await other.send([change(run, "undo", 2)])).toMatchObject(rejected);
      expect((await row(run)).inserted_deloads).toEqual([2]);
      expect(await me.send([change(run, "undo", 2)])).toEqual(applied);
      expect((await row(run)).inserted_deloads).toEqual([]);
    });

    /** A counted workout another device logged: one finished working set, in the Run. */
    async function logCountedWorkout(
      device: Pick<Writer, "send">,
      input: { run: string; program: string; startedAt: string; phase: "build" | "deload" },
    ) {
      const session = uuidv7();
      const entry = uuidv7();
      const set = uuidv7();
      await seedCatalog(app.services.db, bundledCatalogText());
      const [exercise] = await app.rows(
        sql`SELECT id FROM exercise WHERE exercise_type = 'weight_reps' LIMIT 1`,
      );
      return device.send([
        op("PUT", "training_session", session, {
          title: "Workout",
          device_id: uuidv7(),
          started_at: input.startedAt,
          run_id: input.run,
          program_id: input.program,
          phase: input.phase,
        }),
        op("PUT", "session_exercise", entry, {
          session_id: session,
          exercise_id: String(exercise?.id),
          exercise_title: "Bench press",
          exercise_type: "weight_reps",
          position: "a0",
        }),
        op("PUT", "session_set", set, {
          session_exercise_id: entry,
          position: "a0",
          kind: "working",
          weight_kg: 50,
          reps: 5,
          completed_at: input.startedAt,
        }),
        op("PATCH", "training_session", session, { finished_at: input.startedAt }),
      ]);
    }
    /** Run started 2 November with a pause; 17 November in Los Angeles is Run week 3. */
    async function pausedRun(email: string) {
      const me = await writer(email);
      const { run, program } = await runOf(me);
      await me.send([
        op("PATCH", "program_run", run, {
          started_at: "2026-11-02T07:30:00.000Z",
          pauses: JSON.stringify([
            { from: "2026-11-08T20:00:00.000Z", until: "2026-11-11T08:00:00.000Z" },
          ]),
        }),
      ]);
      await me.send([change(run, "insert", 3)]);
      return { me, run, program };
    }
    const trainedAt = "2026-11-17T08:30:00.000Z";
    const undo = (run: string) => change(run, "undo", 3, "America/Los_Angeles");

    it("rejects a queued undo after another device logs a Deload workout in that local week", async () => {
      const { me, run, program } = await pausedRun("deload-counted@example.com");
      const device = me.anotherDevice();
      expect(
        await logCountedWorkout(device, { run, program, startedAt: trainedAt, phase: "deload" }),
      ).toEqual(applied);
      expect(await me.send([undo(run)])).toMatchObject({
        status: "rejected",
        code: "RUN_DELOAD_LOGGED",
      });
      expect((await row(run)).inserted_deloads).toEqual([3]);
    });

    // Build on Monday, "Deload this week" on Wednesday: the Build workout was not the Deload.
    it.each([true, false])(
      "takes a queued undo after a Build workout in that week (workout synced first: %s)",
      async (workoutFirst) => {
        const { me, run, program } = await pausedRun(`deload-build-${workoutFirst}@example.com`);
        const device = me.anotherDevice();
        const build = () =>
          logCountedWorkout(device, { run, program, startedAt: trainedAt, phase: "build" });
        if (workoutFirst) expect(await build()).toEqual(applied);
        expect(await me.send([undo(run)])).toEqual(applied);
        if (!workoutFirst) expect(await build()).toEqual(applied);
        expect((await row(run)).inserted_deloads).toEqual([]);
      },
    );

    it("keeps an undo that arrived before the Deload workout, and refuses it after", async () => {
      const { me, run, program } = await pausedRun("deload-order@example.com");
      const device = me.anotherDevice();
      // Undo first: the week is a Build week again, and a later workout is simply a Build one.
      expect(await me.send([undo(run)])).toEqual(applied);
      expect(
        await logCountedWorkout(device, { run, program, startedAt: trainedAt, phase: "deload" }),
      ).toEqual(applied);
      expect((await row(run)).inserted_deloads).toEqual([]);
      // Insert again, log as the Deload, and the second undo is refused.
      expect(await me.send([change(run, "insert", 3)])).toEqual(applied);
      expect(await me.send([undo(run)])).toMatchObject({ code: "RUN_DELOAD_LOGGED" });
      expect((await row(run)).inserted_deloads).toEqual([3]);
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

    describe("started_at only moves earlier", () => {
      const startOf = async (run: string) => {
        const [stored] = await app.rows(
          sql`SELECT to_char(started_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS at FROM program_run WHERE id = ${run}`,
        );
        return stored?.at ?? null;
      };
      const nov3 = "2026-11-03T08:00:00.000Z";
      const nov10 = "2026-11-10T08:00:00.000Z";

      it.each([
        ["the earlier device uploads first", [nov3, nov10]],
        ["the later device uploads first", [nov10, nov3]],
      ])("keeps the earliest start when %s", async (_name, order) => {
        const me = await writer(`started-${order[0]?.slice(8, 10)}@example.com`);
        const { run } = await runOf(me);
        for (const started_at of order)
          expect(await me.send([op("PATCH", "program_run", run, { started_at })])).toEqual(applied);
        expect(await startOf(run)).toBe(nov3);
      });

      it("keeps the stored start on a PUT that carries a later one or none", async () => {
        const me = await writer("started-put@example.com");
        const { program, run } = await runOf(me);
        await me.send([op("PATCH", "program_run", run, { started_at: nov3 })]);
        const again = (started_at: string | null) =>
          op("PUT", "program_run", run, {
            program_id: program,
            activated_at: "2026-11-02T08:00:00.000Z",
            started_at,
          });
        expect(await me.send([again(nov10)])).toEqual(applied);
        expect(await startOf(run)).toBe(nov3);
        expect(await me.send([again(null)])).toEqual(applied);
        expect(await startOf(run)).toBe(nov3);
      });
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
      const snapshot = { sets: 0.5, rpe: -2, load: 0.9, test_top: "single", load_cuts: [0, 10] };
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
