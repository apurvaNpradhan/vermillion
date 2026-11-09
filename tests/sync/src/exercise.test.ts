import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { checkPrerequisites, describeProblems } from "./prerequisites";
import { createClient, type SyncClient } from "./support/client";
import { createUser, database, serverExercise } from "./support/users";

// Seam 3 for the exercise library (ADR 0034): the catalog stream every user receives, the
// per-user library stream, arrays as JSON text, and refused writes to catalog rows.

const clients: SyncClient[] = [];
async function newClient(...args: Parameters<typeof createClient>) {
  const client = await createClient(...args);
  clients.push(client);
  return client;
}

beforeAll(async () => {
  const problems = await checkPrerequisites();
  if (problems.length > 0) throw new Error(describeProblems(problems));
});

afterAll(async () => {
  await Promise.allSettled(clients.map((client) => client.close()));
  await database.end();
});

const within = { timeout: 60_000 };

async function catalogCount(client: SyncClient) {
  const row = await client.database.get<{ total: number }>(
    "SELECT count(*) AS total FROM exercise WHERE user_id IS NULL",
  );
  return row.total;
}

describe("exercise sync", () => {
  it("gives every user the whole catalog, with arrays as JSON text", async () => {
    const expected = await database.query<{ total: number }>(
      "SELECT count(*)::int AS total FROM exercise WHERE user_id IS NULL",
    );
    const total = expected.rows[0]?.total ?? 0;
    expect(total).toBeGreaterThan(0);

    const [alice, bob] = [await createUser(), await createUser()];
    const [a, b] = [await newClient(alice), await newClient(bob)];
    await Promise.all([a.connect(), b.connect()]);
    await vi.waitFor(async () => expect(await catalogCount(a)).toBe(total), within);
    await vi.waitFor(async () => expect(await catalogCount(b)).toBe(total), within);

    // Retired catalog rows are included so history resolves.
    const retired = await a.database.get<{ total: number }>(
      "SELECT count(*) AS total FROM exercise WHERE retired_at IS NOT NULL",
    );
    expect(retired.total).toBeGreaterThan(0);

    // Postgres arrays arrive as JSON text that SQLite's JSON functions read.
    const muscles = await a.database.get<{ list: string; total: number }>(
      `SELECT secondary_muscles AS list, json_array_length(secondary_muscles) AS total
         FROM exercise WHERE user_id IS NULL AND json_array_length(secondary_muscles) >= 2 LIMIT 1`,
    );
    expect(JSON.parse(muscles.list)).toHaveLength(muscles.total);
    const flattened = await a.database.getAll<{ value: string }>(
      `SELECT DISTINCT j.value AS value FROM exercise e, json_each(e.secondary_muscles) j
        WHERE e.user_id IS NULL LIMIT 5`,
    );
    expect(flattened.length).toBeGreaterThan(0);
  });

  it("syncs Custom exercises to the owner's devices only", async () => {
    const [alice, bob] = [await createUser(), await createUser()];
    const [a, a2, b] = [await newClient(alice), await newClient(alice), await newClient(bob)];
    await Promise.all([a.connect(), a2.connect(), b.connect()]);

    const id = uuidv7();
    await a.createExercise(id, alice.userId, "Alice only press");
    await a.uploaded();
    expect(await serverExercise(id)).toMatchObject({
      user_id: alice.userId,
      title: "Alice only press",
      secondary_muscles: ["triceps"],
    });

    // Alice's second device gets it, with the array as JSON text.
    await vi.waitFor(async () => {
      const row = await a2.database.getOptional<{ title: string; secondary_muscles: string }>(
        "SELECT title, secondary_muscles FROM exercise WHERE id = ?",
        [id],
      );
      expect(row).toMatchObject({ title: "Alice only press", secondary_muscles: '["triceps"]' });
    }, within);

    // Bob's device holds the catalog and none of Alice's exercises.
    await vi.waitFor(async () => expect(await catalogCount(b)).toBeGreaterThan(0), within);
    const foreign = await b.database.getAll<{ id: string }>(
      "SELECT id FROM exercise WHERE user_id IS NOT NULL",
    );
    expect(foreign).toEqual([]);
  });

  it("refuses a client write to a catalog row", async () => {
    const user = await createUser();
    const client = await newClient(user);
    await client.connect();
    await vi.waitFor(async () => expect(await catalogCount(client)).toBeGreaterThan(0), within);

    const target = await client.database.get<{ id: string; title: string }>(
      "SELECT id, title FROM exercise WHERE user_id IS NULL LIMIT 1",
    );
    await client.database.execute("UPDATE exercise SET title = ? WHERE id = ?", [
      "Tampered",
      target.id,
    ]);
    await client.uploaded();

    const outcomes = [...client.outcomes().values()];
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]).toMatchObject({ status: "rejected", code: "EXERCISE_CATALOG_READ_ONLY" });
    expect((await serverExercise(target.id))?.title).toBe(target.title);
  });
});

// The upload and replication protocol, with the Custom exercise as the experiment subject: the
// one synced table a client may write (ADR 0024, 0035).
describe("custom exercise sync protocol", () => {
  const exerciseId = () => uuidv7();

  it("round trips a Custom exercise from one device to another of the same user", async () => {
    const user = await createUser();
    const [a, b] = [await newClient(user), await newClient(user)];
    await Promise.all([a.connect(), b.connect()]);

    const id = exerciseId();
    await a.createExercise(id, user.userId, "Round trip", "from A");
    await a.uploaded();

    expect(await serverExercise(id)).toMatchObject({
      user_id: user.userId,
      title: "Round trip",
      instructions: "from A",
    });
    await vi.waitFor(async () => {
      expect(await b.exercise(id)).toMatchObject({ title: "Round trip", instructions: "from A" });
    }, within);
    // Server-managed columns arrive through the stream.
    expect(Date.parse((await b.exercise(id))?.created_at ?? "")).not.toBeNaN();

    // An edit travels as a PATCH and reaches B too.
    await a.updateExercise(id, { instructions: "edited on A" });
    await a.uploaded();
    await vi.waitFor(
      async () => expect((await b.exercise(id))?.instructions).toBe("edited on A"),
      within,
    );
    expect((await serverExercise(id))?.title).toBe("Round trip");
  });

  it("delivers a row written straight into Postgres", async () => {
    const user = await createUser();
    const client = await newClient(user);
    await client.connect();
    const id = exerciseId();
    await database.query(
      `INSERT INTO exercise (id, user_id, title, primary_muscle, equipment, exercise_type)
       VALUES ($1, $2, 'Server row', 'chest', 'dumbbell', 'weight_reps')`,
      [id, user.userId],
    );
    await vi.waitFor(
      async () => expect(await client.exercise(id)).toMatchObject({ title: "Server row" }),
      within,
    );
  });

  it("refuses cross-account writes and never sends one user's exercise to another", async () => {
    const [alice, bob] = [await createUser(), await createUser()];
    const [a, a2, b] = [await newClient(alice), await newClient(alice), await newClient(bob)];
    await Promise.all([a.connect(), a2.connect(), b.connect()]);

    const id = exerciseId();
    await a.createExercise(id, alice.userId, "Alice only", "secret");
    await a.uploaded();
    // Alice's second device receiving it proves the stream has run past this write.
    await vi.waitFor(async () => expect(await a2.exercise(id)).not.toBeNull(), within);
    expect(await b.customIds()).toEqual([]);

    // Bob writes with Alice's exercise id: a create and an edit (queued as two transactions) are
    // both refused, nothing changes.
    await b.createExercise(id, bob.userId, "Hijack", "mine now");
    await b.updateExercise(id, { instructions: "tampered" });
    await b.uploaded();
    const outcomes = b.records.flatMap((r) => (r.kind === "result" ? [r.result] : []));
    expect(outcomes).toHaveLength(2);
    expect(outcomes.every((o) => o.status === "rejected")).toBe(true);
    expect(await serverExercise(id)).toMatchObject({
      user_id: alice.userId,
      title: "Alice only",
      instructions: "secret",
    });
    // Bob's device never holds Alice's content.
    expect(await b.exercise(id)).not.toMatchObject({ title: "Alice only" });
  });

  it("propagates an archive to the other device without deleting the row", async () => {
    const user = await createUser();
    const [a, b] = [await newClient(user), await newClient(user)];
    await Promise.all([a.connect(), b.connect()]);

    const id = exerciseId();
    await a.createExercise(id, user.userId, "Short lived");
    await a.uploaded();
    await vi.waitFor(async () => expect(await b.exercise(id)).not.toBeNull(), within);

    await a.updateExercise(id, { retired_at: new Date().toISOString() });
    await a.uploaded();
    await vi.waitFor(async () => expect((await b.exercise(id))?.retired_at).not.toBeNull(), within);
    expect((await serverExercise(id))?.retired_at).toBeInstanceOf(Date);
  });

  it("applies a transaction once when the acknowledgement is lost, and does not overwrite later edits", async () => {
    const user = await createUser();
    // A's first upload commits on the server but the response never arrives.
    const a = await newClient(user, { loseResponses: 1 });
    const b = await newClient(user);
    await Promise.all([a.connect(), b.connect()]);

    const id = exerciseId();
    await a.createExercise(id, user.userId, "Ack loss", "from A");
    await vi.waitFor(
      async () => expect(await serverExercise(id)).toMatchObject({ instructions: "from A" }),
      within,
    );
    // Before A retries, B edits the same field.
    await vi.waitFor(async () => expect(await b.exercise(id)).not.toBeNull(), within);
    await b.updateExercise(id, { instructions: "edited by B" });
    await b.uploaded();

    // A retries the identical transaction: the receipt answers, nothing is applied again.
    await a.uploaded();
    expect(a.records.some((r) => r.kind === "error" && r.code === "RESPONSE_LOST")).toBe(true);
    expect(a.records.some((r) => r.kind === "result" && r.result.status === "applied")).toBe(true);
    expect(await serverExercise(id)).toMatchObject({
      title: "Ack loss",
      instructions: "edited by B",
    });
    const { rows } = await database.query("SELECT 1 FROM exercise WHERE user_id = $1", [
      user.userId,
    ]);
    expect(rows).toHaveLength(1);
    await vi.waitFor(
      async () => expect((await a.exercise(id))?.instructions).toBe("edited by B"),
      within,
    );
  });

  it("answers a permanent rejection for invalid and oversize writes, and moves on", async () => {
    const user = await createUser();
    const [a, b] = [await newClient(user), await newClient(user)];
    await Promise.all([a.connect(), b.connect()]);

    const invalid = exerciseId();
    await a.createExercise(invalid, user.userId, ""); // empty title fails validation
    await a.uploaded();
    const oversize = exerciseId();
    // Beyond the 64 KiB value cap.
    await a.createExercise(oversize, user.userId, "Too big", "x".repeat(70 * 1024));
    await a.uploaded();
    const valid = exerciseId();
    await a.createExercise(valid, user.userId, "Fine");
    await a.uploaded();

    const results = a.records.flatMap((r) => (r.kind === "result" ? [r.result] : []));
    expect(results.map((r) => r.status)).toEqual(["rejected", "rejected", "applied"]);
    expect(results[0]).toMatchObject({ code: "SYNC_INVALID_OP", failedIndex: 0 });
    expect(results[1]).toMatchObject({ code: "SYNC_LIMIT_EXCEEDED", failedIndex: null });
    expect(await serverExercise(invalid)).toBeUndefined();
    expect(await serverExercise(oversize)).toBeUndefined();
    expect(await serverExercise(valid)).toMatchObject({ title: "Fine" });
    // The queue was not blocked, and the other device only sees the accepted exercise.
    await vi.waitFor(async () => expect(await b.customIds()).toEqual([valid]), within);
  });

  it("queues writes made offline and converges after reconnecting", async () => {
    const user = await createUser();
    const [a, b] = [await newClient(user), await newClient(user)];
    await Promise.all([a.connect(), b.connect()]);
    await a.disconnect();

    const first = exerciseId();
    const second = exerciseId();
    await a.createExercise(first, user.userId, "Offline one", "1");
    await a.createExercise(second, user.userId, "Offline two", "2");
    await a.updateExercise(first, { instructions: "1 edited" });
    expect(await a.queued()).toBeGreaterThan(0);
    expect(await serverExercise(first)).toBeUndefined();
    expect(await b.customIds()).toEqual([]);

    await a.connect();
    await a.uploaded();
    expect(await serverExercise(first)).toMatchObject({
      title: "Offline one",
      instructions: "1 edited",
    });
    expect(await serverExercise(second)).toMatchObject({ title: "Offline two" });
    // Each offline write uploads as its own transaction, so B may first see the create's
    // checkpoint and only later the update's: wait for the converged state, not just the ids.
    await vi.waitFor(async () => {
      expect((await b.customIds()).toSorted()).toEqual([first, second].toSorted());
      expect((await b.exercise(first))?.instructions).toBe("1 edited");
    }, within);
  });
});
