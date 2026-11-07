import { v7 as uuidv7 } from "uuid";
import { describe, expect, it, vi } from "vitest";

import type { SyncClient } from "./support/client";
import { useSyncSuite, within } from "./support/suite";
import { createUser, database, serverNote } from "./support/users";

// Seam 3, phase 7: delete races, late writes and rollback siblings (ADR 0018/0019). Every
// write must end applied or as a recorded rejection; the devices converge on the server.

const newClient = useSyncSuite();

/** The permanent verdicts a client's uploads received, as `status` or the first failing code. */
function verdicts(client: SyncClient) {
  return [...client.outcomes().values()].map((o) => (o.status === "applied" ? "applied" : o.code));
}

const gone = (client: SyncClient, id: string) =>
  vi.waitFor(async () => expect(await client.note(id)).toBeNull(), within);

describe("delete races", () => {
  it("an edit made offline loses to a delete uploaded first, and is recorded as rejected", async () => {
    const user = await createUser();
    const [a, b] = [await newClient(user), await newClient(user)];
    await Promise.all([a.connect(), b.connect()]);
    const id = uuidv7();
    await a.createNote(id, "Contested", "v0");
    await a.uploaded();
    await vi.waitFor(async () => expect(await b.note(id)).not.toBeNull(), within);

    await b.disconnect();
    await b.updateNote(id, { body: "edited offline" });
    await a.deleteNote(id);
    await a.uploaded();

    await b.connect();
    await b.uploaded();
    expect(verdicts(b)).toEqual(["SYNC_ROW_DELETED"]);
    expect((await serverNote(id))?.deleted_at).toBeInstanceOf(Date);
    expect((await serverNote(id))?.body).toBe("v0");
    await gone(b, id);
    await gone(a, id);
  });

  it("a delete uploaded after an edit still wins, and both devices converge", async () => {
    const user = await createUser();
    const [a, b] = [await newClient(user), await newClient(user)];
    await Promise.all([a.connect(), b.connect()]);
    const id = uuidv7();
    await a.createNote(id, "Contested", "v0");
    await a.uploaded();
    await vi.waitFor(async () => expect(await b.note(id)).not.toBeNull(), within);

    await a.disconnect();
    await a.deleteNote(id);
    await b.updateNote(id, { body: "edited online" });
    await b.uploaded();
    await a.connect();
    await a.uploaded();

    expect(verdicts(a)).toEqual(["applied", "applied"]); // the create, then the delete
    expect((await serverNote(id))?.deleted_at).toBeInstanceOf(Date);
    await gone(a, id);
    await gone(b, id);
  });

  it("a late create of a deleted id is refused and the live set does not change", async () => {
    const user = await createUser();
    const [a, late] = [await newClient(user), await newClient(user)];
    await a.connect();
    const id = uuidv7();
    await a.createNote(id, "Original");
    await a.uploaded();
    await a.deleteNote(id);
    await a.uploaded();

    // A device that never saw the note writes the same id offline.
    await late.createNote(id, "Zombie");
    await late.connect();
    await late.uploaded();
    expect(verdicts(late)).toEqual(["SYNC_ROW_DELETED"]);
    expect(await serverNote(id)).toMatchObject({ title: "Original" });
    await gone(late, id);
  });

  it("a late edit of a purged row is refused as not found", async () => {
    const user = await createUser();
    const [a, b] = [await newClient(user), await newClient(user)];
    await Promise.all([a.connect(), b.connect()]);
    const id = uuidv7();
    await a.createNote(id, "Purged soon");
    await a.uploaded();
    await vi.waitFor(async () => expect(await b.note(id)).not.toBeNull(), within);

    await b.disconnect();
    await b.updateNote(id, { title: "too late" });
    // Retention elapsed: the tombstone was hard deleted while b was away.
    await database.query("DELETE FROM notes WHERE id = $1", [id]);
    await b.connect();
    await b.uploaded();
    expect(verdicts(b)).toEqual(["SYNC_ROW_NOT_FOUND"]);
    expect(await serverNote(id)).toBeUndefined();
    await gone(b, id);
  });
});

describe("ownership and rollback", () => {
  it("a create with an id owned by another user is refused and leaks nothing", async () => {
    const [alice, bob] = [await createUser(), await createUser()];
    const [a, b] = [await newClient(alice), await newClient(bob)];
    await Promise.all([a.connect(), b.connect()]);
    const id = uuidv7();
    await a.createNote(id, "Alice's", "private");
    await a.uploaded();

    await b.createNote(id, "Bob's claim");
    await b.uploaded();
    expect(verdicts(b)).toEqual(["SYNC_ID_CONFLICT"]);
    expect(await serverNote(id)).toMatchObject({ user_id: alice.userId, title: "Alice's" });
    await gone(b, id);
    expect(await a.note(id)).toMatchObject({ title: "Alice's", body: "private" });
  });

  it("a rejected sibling rolls the whole transaction back and the device converges", async () => {
    const user = await createUser();
    const [a, b] = [await newClient(user), await newClient(user)];
    await Promise.all([a.connect(), b.connect()]);
    const good = uuidv7();
    const bad = uuidv7();

    // One local transaction, so one upload: a valid create followed by an invalid one.
    await a.database.writeTransaction(async (tx) => {
      await tx.execute("INSERT INTO notes (id, title, body) VALUES (?, ?, '')", [good, "Fine"]);
      await tx.execute("INSERT INTO notes (id, title, body) VALUES (?, ?, '')", [bad, ""]);
    });
    await a.uploaded();

    const [outcome] = [...a.outcomes().values()];
    expect(a.outcomes().size).toBe(1);
    expect(outcome).toEqual({
      status: "rejected",
      code: "SYNC_INVALID_OP",
      failedIndex: 1,
      ops: ["SYNC_TRANSACTION_ROLLED_BACK", "SYNC_INVALID_OP"],
    });
    expect(await serverNote(good)).toBeUndefined();
    expect(await serverNote(bad)).toBeUndefined();
    // The sibling vanishes locally too once the checkpoint passes: no phantom row survives.
    await gone(a, good);
    await gone(a, bad);
    expect(await b.noteIds()).toEqual([]);
  });
});
