import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { watchSession } from "../watch";
import {
  createHistoryDatabase,
  exerciseId,
  makeWorkout,
  seedHistory,
  type HistoryDatabase,
} from "./session-open-fixture";
import { beginSession, newSessionId } from "./session-store";
import {
  ACTIVE_SESSIONS_SQL,
  EQUIPMENT_SQL,
  EXERCISE_BARS_SQL,
  SESSION_DETAIL_SQL,
  SESSION_LAST_NOTES_SQL,
  SESSIONS_BETWEEN_SQL,
  exerciseHistoriesSql,
  exerciseRecordsSql,
  finishedByIdsSql,
  finishedFingerprintSql,
  type SessionDetail,
} from "./session-watch";

/**
 * What the live Session screen reads when it opens, on real PowerSync (the production schema, its
 * views and local indexes) over a lifter's history. A read that joins a view with LEFT JOIN cannot
 * use the local indexes: it scanned the whole history for every row, so it grew with the square of
 * it (phone QA M6: an empty screen for seconds after "Discard and start"). The plan checks catch
 * that shape whatever the machine; the budget catches a slow query that still has a good plan.
 *
 * `SESSION_OPEN_REPORT=40,200,1000 pnpm --filter @workspace/sync exec vitest run <this file>`
 * prints the timings for those history sizes.
 */

type Query = { name: string; sql: string; params: string[] };

type Scene = {
  fixture: HistoryDatabase;
  sessionId: string;
  queries: Query[];
};

/** A history of `size` finished Sessions, then an unfinished one discarded for a new one. */
async function openScene(size: number): Promise<Scene> {
  const fixture = await createHistoryDatabase();
  const { database } = fixture;
  await seedHistory(fixture, { sessions: size });
  const { workoutId } = await makeWorkout(fixture);
  const old = await beginSession(
    database,
    { workoutId, timeZone: "UTC" },
    "Untitled",
    { id: newSessionId() },
    fixture.installId,
  );
  const { id: sessionId } = await beginSession(
    database,
    { workoutId, timeZone: "UTC" },
    "Untitled",
    { id: newSessionId(), discardIds: [old.id] },
    fixture.installId,
  );
  const lifts = Array.from({ length: 6 }, (_, at) => exerciseId([0, 5, 2, 6, 4, 8][at] ?? 0));
  const [started] = await database.getAll<{ started_at: string }>(
    "SELECT started_at FROM training_session WHERE id = ?",
    [sessionId],
  );
  const startedAt = started?.started_at ?? "";
  const [one] = await database.getAll<{ id: string }>(
    "SELECT id FROM training_session WHERE finished_at IS NOT NULL LIMIT 1",
  );
  const queries: Query[] = [
    { name: "active sessions", sql: ACTIVE_SESSIONS_SQL, params: [] },
    { name: "session detail", sql: SESSION_DETAIL_SQL, params: [sessionId] },
    { name: "last notes", sql: SESSION_LAST_NOTES_SQL, params: [sessionId] },
    { name: "histories", sql: exerciseHistoriesSql(lifts.length), params: [...lifts, ...lifts] },
    {
      name: "record fingerprint",
      sql: finishedFingerprintSql(false, lifts.length),
      params: [...lifts, startedAt, startedAt, sessionId],
    },
    {
      name: "history fingerprint",
      sql: finishedFingerprintSql(true),
      params: ["2000-01-01T00:00:00.000Z", "9999-01-01T00:00:00.000Z"],
    },
    { name: "finished by ids", sql: finishedByIdsSql(1), params: [one?.id ?? ""] },
    {
      name: "sessions between",
      sql: SESSIONS_BETWEEN_SQL,
      params: ["2000-01-01T00:00:00.000Z", "9999-01-01T00:00:00.000Z"],
    },
    { name: "equipment", sql: EQUIPMENT_SQL, params: ["", "1"] },
    { name: "exercise bars", sql: EXERCISE_BARS_SQL, params: [] },
    {
      name: "records (one lift)",
      sql: exerciseRecordsSql(false, true),
      params: [JSON.stringify([lifts[0]]), startedAt, startedAt, sessionId],
    },
  ];
  return { fixture, sessionId, queries };
}

async function median(run: () => Promise<readonly object[]>, times = 3) {
  const samples: number[] = [];
  for (let at = 0; at < times; at++) {
    const started = performance.now();
    await run();
    samples.push(performance.now() - started);
  }
  return samples.sort((a, b) => a - b)[Math.floor(times / 2)] ?? 0;
}

function firstSession(database: HistoryDatabase["database"], id: string) {
  return new Promise<SessionDetail | null>((resolve, reject) => {
    const stop = watchSession(database, id, {
      onSession: (session) => {
        stop();
        resolve(session);
      },
      onError: reject,
    });
  });
}

const reportSizes = (process.env["SESSION_OPEN_REPORT"] ?? "").split(",").filter(Boolean);

describe("opening a live Session over 200 finished Sessions", () => {
  let scene: Scene;
  beforeAll(async () => {
    scene = await openScene(200);
  }, 120_000);
  afterAll(async () => {
    await scene.fixture.close();
  });

  it("reads the session tables by index, never by a scan of their history", async () => {
    for (const query of scene.queries) {
      const plan = await scene.fixture.database.getAll<{ detail: string }>(
        `EXPLAIN QUERY PLAN ${query.sql}`,
        query.params,
      );
      const details = plan.map((row) => row.detail);
      // `SCAN ps_data__session_set` is a walk over every row of the table: a join onto the view
      // that could not use its index. (A scan of a materialized copy has another name.)
      const scans = details.filter((detail) =>
        /^SCAN ps_data__session_(exercise|set)\b/.test(detail),
      );
      expect(scans, `${query.name}\n${details.join("\n")}`).toEqual([]);
    }
  });

  it.skipIf(process.env["SESSION_OPEN_SKIP_TIMING"] === "1")(
    "answers each query well inside a budget a quadratic read would break",
    async () => {
      // Before the fix, the record fingerprint alone took 800 ms here and 23 s over 1000 Sessions.
      for (const query of scene.queries) {
        const took = await median(() => scene.fixture.database.getAll(query.sql, query.params));
        expect(took, `${query.name} took ${took.toFixed(1)} ms`).toBeLessThan(150);
      }
    },
  );

  it("gives the Session its exercises and sets on the first answer", async () => {
    const session = await firstSession(scene.fixture.database, scene.sessionId);
    expect(session?.exercises).toHaveLength(6);
    expect(session?.exercises.map((entry) => entry.sets.length)).toEqual([3, 3, 3, 3, 3, 3]);
    expect(session?.exercises[0]?.title).toBe("Bench press");
  });

  it("still returns a Session with no exercises, and an exercise with no sets", async () => {
    const { database, installId } = scene.fixture;
    const empty = await beginSession(
      database,
      { workoutId: null },
      "Untitled",
      { id: newSessionId() },
      installId,
    );
    const bare = await firstSession(database, empty.id);
    expect(bare).toMatchObject({ id: empty.id, exercises: [] });

    const { workoutId } = await makeWorkout(scene.fixture);
    await database.execute(
      `UPDATE workout_exercise SET sets = '[]' WHERE workout_id = ? AND id IN (
         SELECT id FROM workout_exercise WHERE workout_id = ? LIMIT 1)`,
      [workoutId, workoutId],
    );
    const again = await beginSession(
      database,
      { workoutId, timeZone: "UTC" },
      "Untitled",
      { id: newSessionId() },
      installId,
    );
    const session = await firstSession(database, again.id);
    expect(session?.exercises).toHaveLength(6);
    expect(session?.exercises.filter((entry) => entry.sets.length === 0)).toHaveLength(1);
  });
});

describe.runIf(reportSizes.length > 0)("timing report", () => {
  for (const size of reportSizes.map(Number)) {
    it(`over ${size} finished Sessions`, async () => {
      const scene = await openScene(size);
      try {
        const lines = [`\n${size} finished Sessions (median of 3, ms)`];
        for (const query of scene.queries) {
          const took = await median(() => scene.fixture.database.getAll(query.sql, query.params));
          lines.push(`  ${query.name.padEnd(22)} ${took.toFixed(1).padStart(9)}`);
        }
        const started = performance.now();
        await firstSession(scene.fixture.database, scene.sessionId);
        lines.push(
          `  ${"watchSession first".padEnd(22)} ${(performance.now() - started).toFixed(1).padStart(9)}`,
        );
        process.stdout.write(`${lines.join("\n")}\n`);
      } finally {
        await scene.fixture.close();
      }
    }, 300_000);
  }
});
