import { v7 as uuidv7 } from "uuid";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { checkPrerequisites, describeProblems } from "./prerequisites";
import { createClient, type SyncClient } from "./support/client";
import { createUser, database, serverNote } from "./support/users";

// Seam 3 (ADR 0024) for the notes table: headless @powersync/node clients, the real API,
// Postgres and the PowerSync service. Isolation: every test registers its own users, so
// rows never collide in the shared database and nothing needs cleaning up (deleting a
// user cascades to their notes anyway).

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

const noteId = () => uuidv7();
const within = { timeout: 30_000 };

describe("notes sync", () => {
  it("round trips a note from one device to another of the same user", async () => {
    const user = await createUser();
    const [a, b] = [await newClient(user), await newClient(user)];
    await Promise.all([a.connect(), b.connect()]);

    const id = noteId();
    await a.createNote(id, "Round trip", "from A");
    await a.uploaded();

    expect(await serverNote(id)).toMatchObject({
      user_id: user.userId,
      title: "Round trip",
      body: "from A",
    });
    await vi.waitFor(async () => {
      expect(await b.note(id)).toMatchObject({ title: "Round trip", body: "from A" });
    }, within);
    // Server-managed columns arrive through the stream.
    const row = await b.note(id);
    expect(Date.parse(row?.created_at ?? "")).not.toBeNaN();
    expect(Date.parse(row?.updated_at ?? "")).not.toBeNaN();

    // An edit travels as a PATCH and reaches B too.
    await a.updateNote(id, { body: "edited on A" });
    await a.uploaded();
    await vi.waitFor(async () => expect((await b.note(id))?.body).toBe("edited on A"), within);
    expect((await serverNote(id))?.title).toBe("Round trip");
  });

  it("delivers a row written straight into Postgres", async () => {
    const user = await createUser();
    const client = await newClient(user);
    await client.connect();
    const id = noteId();
    await database.query("INSERT INTO notes (id, user_id, title) VALUES ($1, $2, 'Server row')", [
      id,
      user.userId,
    ]);
    await vi.waitFor(
      async () => expect(await client.note(id)).toMatchObject({ title: "Server row", body: "" }),
      within,
    );
  });

  it("never sends one user's notes to another, and refuses cross-account writes", async () => {
    const [alice, bob] = [await createUser(), await createUser()];
    const [a, a2, b] = [await newClient(alice), await newClient(alice), await newClient(bob)];
    await Promise.all([a.connect(), a2.connect(), b.connect()]);

    const id = noteId();
    await a.createNote(id, "Alice only", "secret");
    await a.uploaded();
    // Alice's second device receiving it proves the stream has run past this write.
    await vi.waitFor(async () => expect(await a2.note(id)).not.toBeNull(), within);
    expect(await b.noteIds()).toEqual([]);

    // Bob writes with Alice's note id: a create and an edit are both refused, nothing changes.
    await b.createNote(id, "Hijack", "mine now");
    await b.uploaded();
    await b.updateNote(id, { body: "tampered" });
    await b.uploaded();
    const outcomes = b.records.flatMap((r) => (r.kind === "result" ? [r.result] : []));
    expect(outcomes).toHaveLength(2);
    expect(outcomes.every((o) => o.status === "rejected")).toBe(true);
    expect(await serverNote(id)).toMatchObject({
      user_id: alice.userId,
      title: "Alice only",
      body: "secret",
    });
    // Bob's device only holds his own refused local edit, never Alice's content.
    expect(await b.note(id)).not.toMatchObject({ title: "Alice only" });
  });

  it("propagates a delete: the row disappears on the other device and is soft deleted", async () => {
    const user = await createUser();
    const [a, b] = [await newClient(user), await newClient(user)];
    await Promise.all([a.connect(), b.connect()]);

    const id = noteId();
    await a.createNote(id, "Short lived");
    await a.uploaded();
    await vi.waitFor(async () => expect(await b.note(id)).not.toBeNull(), within);

    await a.deleteNote(id);
    await a.uploaded();
    await vi.waitFor(async () => expect(await b.note(id)).toBeNull(), within);
    expect((await serverNote(id))?.deleted_at).toBeInstanceOf(Date);
  });

  it("applies a transaction once when the acknowledgement is lost, and does not overwrite later edits", async () => {
    const user = await createUser();
    // A's first upload commits on the server but the response never arrives.
    const a = await newClient(user, { loseResponses: 1 });
    const b = await newClient(user);
    await Promise.all([a.connect(), b.connect()]);

    const id = noteId();
    await a.createNote(id, "Ack loss", "from A");
    await vi.waitFor(
      async () => expect(await serverNote(id)).toMatchObject({ body: "from A" }),
      within,
    );
    // Before A retries, B edits the same field.
    await vi.waitFor(async () => expect(await b.note(id)).not.toBeNull(), within);
    await b.updateNote(id, { body: "edited by B" });
    await b.uploaded();

    // A retries the identical transaction: the receipt answers, nothing is applied again.
    await a.uploaded();
    expect(a.records.some((r) => r.kind === "error" && r.code === "RESPONSE_LOST")).toBe(true);
    expect(a.records.some((r) => r.kind === "result" && r.result.status === "applied")).toBe(true);
    expect(await serverNote(id)).toMatchObject({ title: "Ack loss", body: "edited by B" });
    const { rows } = await database.query("SELECT 1 FROM notes WHERE user_id = $1", [user.userId]);
    expect(rows).toHaveLength(1);
    await vi.waitFor(async () => expect((await a.note(id))?.body).toBe("edited by B"), within);
  });

  it("answers a permanent rejection for invalid and oversize writes, and moves on", async () => {
    const user = await createUser();
    const [a, b] = [await newClient(user), await newClient(user)];
    await Promise.all([a.connect(), b.connect()]);

    const invalid = noteId();
    await a.createNote(invalid, ""); // empty title fails validation
    await a.uploaded();
    const oversize = noteId();
    await a.createNote(oversize, "Too big", "x".repeat(70 * 1024)); // beyond the 64 KiB value cap
    await a.uploaded();
    const valid = noteId();
    await a.createNote(valid, "Fine");
    await a.uploaded();

    const results = a.records.flatMap((r) => (r.kind === "result" ? [r.result] : []));
    expect(results.map((r) => r.status)).toEqual(["rejected", "rejected", "applied"]);
    expect(results[0]).toMatchObject({ code: "SYNC_INVALID_OP", failedIndex: 0 });
    expect(results[1]).toMatchObject({ code: "SYNC_LIMIT_EXCEEDED", failedIndex: null });
    expect(await serverNote(invalid)).toBeUndefined();
    expect(await serverNote(oversize)).toBeUndefined();
    expect(await serverNote(valid)).toMatchObject({ title: "Fine" });
    // The queue was not blocked, and the other device only sees the accepted note.
    await vi.waitFor(async () => expect(await b.noteIds()).toEqual([valid]), within);
  });

  it("queues writes made offline and converges after reconnecting", async () => {
    const user = await createUser();
    const [a, b] = [await newClient(user), await newClient(user)];
    await Promise.all([a.connect(), b.connect()]);
    await a.disconnect();

    const first = noteId();
    const second = noteId();
    await a.createNote(first, "Offline one", "1");
    await a.createNote(second, "Offline two", "2");
    await a.updateNote(first, { body: "1 edited" });
    expect(await a.queued()).toBeGreaterThan(0);
    expect(await serverNote(first)).toBeUndefined();
    expect(await b.noteIds()).toEqual([]);

    await a.connect();
    await a.uploaded();
    expect(await serverNote(first)).toMatchObject({ title: "Offline one", body: "1 edited" });
    expect(await serverNote(second)).toMatchObject({ title: "Offline two" });
    await vi.waitFor(
      async () => expect((await b.noteIds()).toSorted()).toEqual([first, second].toSorted()),
      within,
    );
    expect((await b.note(first))?.body).toBe("1 edited");
  });
});
