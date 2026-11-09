import { v7 as uuidv7 } from "uuid";
import { describe, expect, it, vi } from "vitest";

import type { SyncClient } from "./support/client";
import { useSyncSuite, within } from "./support/suite";
import { createUser, serverExercise } from "./support/users";

// Seam 3, phase 7: concurrent edits, refused deletes and rollback siblings (ADR 0018/0019), with
// the Custom exercise as the subject. Every write must end applied or as a recorded rejection;
// the devices converge on the server.

const newClient = useSyncSuite();

/** The permanent verdicts a client's uploads received, as `status` or the first failing code. */
function verdicts(client: SyncClient) {
  return [...client.outcomes().values()].map((o) => (o.status === "applied" ? "applied" : o.code));
}

describe("concurrent edits", () => {
  it("an edit made offline and an archive uploaded first both apply, and the devices converge", async () => {
    const user = await createUser();
    const [a, b] = [await newClient(user), await newClient(user)];
    await Promise.all([a.connect(), b.connect()]);
    const id = uuidv7();
    await a.createExercise(id, user.userId, "Contested", "v0");
    await a.uploaded();
    await vi.waitFor(async () => expect(await b.exercise(id)).not.toBeNull(), within);

    await b.disconnect();
    await b.updateExercise(id, { title: "Edited offline" });
    await a.updateExercise(id, { retired_at: new Date().toISOString() });
    await a.uploaded();

    await b.connect();
    await b.uploaded();
    // Different fields: both land; the archive is not undone by the late edit.
    expect(verdicts(b)).toEqual(["applied"]);
    expect(await serverExercise(id)).toMatchObject({
      title: "Edited offline",
      instructions: "v0",
      retired_at: expect.any(Date),
    });
    for (const client of [a, b]) {
      await vi.waitFor(async () => {
        expect(await client.exercise(id)).toMatchObject({ title: "Edited offline" });
        expect((await client.exercise(id))?.retired_at).not.toBeNull();
      }, within);
    }
  });

  it("two devices editing the same field end on the last upload, on every device", async () => {
    const user = await createUser();
    const [a, b] = [await newClient(user), await newClient(user)];
    await Promise.all([a.connect(), b.connect()]);
    const id = uuidv7();
    await a.createExercise(id, user.userId, "Contested", "v0");
    await a.uploaded();
    await vi.waitFor(async () => expect(await b.exercise(id)).not.toBeNull(), within);

    await a.disconnect();
    await a.updateExercise(id, { instructions: "from A" });
    await b.updateExercise(id, { instructions: "from B" });
    await b.uploaded();
    await a.connect();
    await a.uploaded();

    expect(verdicts(a)).toEqual(["applied", "applied"]); // the create, then the edit
    // Server application order decides: A's edit was uploaded last.
    expect((await serverExercise(id))?.instructions).toBe("from A");
    for (const client of [a, b]) {
      await vi.waitFor(
        async () => expect((await client.exercise(id))?.instructions).toBe("from A"),
        within,
      );
    }
  });

  it("a delete is refused, recorded, and the row survives on every device", async () => {
    const user = await createUser();
    const [a, b] = [await newClient(user), await newClient(user)];
    await Promise.all([a.connect(), b.connect()]);
    const id = uuidv7();
    await a.createExercise(id, user.userId, "Keep me");
    await a.uploaded();
    await vi.waitFor(async () => expect(await b.exercise(id)).not.toBeNull(), within);

    await a.deleteExercise(id);
    await a.uploaded();
    expect(verdicts(a)).toEqual(["applied", "EXERCISE_DELETE_NOT_ALLOWED"]);
    expect(await serverExercise(id)).toMatchObject({ title: "Keep me" });
    // The refused local delete is rolled back by the next checkpoint: the row returns.
    await vi.waitFor(
      async () => expect(await a.exercise(id)).toMatchObject({ title: "Keep me" }),
      within,
    );
    expect(await b.exercise(id)).toMatchObject({ title: "Keep me" });
  });
});

describe("ownership and rollback", () => {
  it("a create with an id owned by another user is refused and leaks nothing", async () => {
    const [alice, bob] = [await createUser(), await createUser()];
    const [a, b] = [await newClient(alice), await newClient(bob)];
    await Promise.all([a.connect(), b.connect()]);
    const id = uuidv7();
    await a.createExercise(id, alice.userId, "Alice's", "private");
    await a.uploaded();

    await b.createExercise(id, bob.userId, "Bob's claim");
    await b.uploaded();
    expect(verdicts(b)).toEqual(["SYNC_ID_CONFLICT"]);
    expect(await serverExercise(id)).toMatchObject({ user_id: alice.userId, title: "Alice's" });
    await vi.waitFor(async () => expect(await b.exercise(id)).toBeNull(), within);
    expect(await a.exercise(id)).toMatchObject({ title: "Alice's", instructions: "private" });
  });

  it("a rejected sibling rolls the whole transaction back and the device converges", async () => {
    const user = await createUser();
    const [a, b] = [await newClient(user), await newClient(user)];
    await Promise.all([a.connect(), b.connect()]);
    const good = uuidv7();
    const bad = uuidv7();

    // One local transaction, so one upload: a valid create followed by an invalid one.
    const insert = (id: string, title: string) =>
      `INSERT INTO exercise (id, user_id, title, primary_muscle, secondary_muscles, equipment,
         exercise_type, is_full_bodyweight, created_at)
       VALUES ('${id}', '${user.userId}', '${title}', 'chest', '[]', 'dumbbell', 'weight_reps', 0,
         '${new Date().toISOString()}')`;
    await a.database.writeTransaction(async (tx) => {
      await tx.execute(insert(good, "Fine"));
      await tx.execute(insert(bad, ""));
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
    expect(await serverExercise(good)).toBeUndefined();
    expect(await serverExercise(bad)).toBeUndefined();
    // The sibling vanishes locally too once the checkpoint passes: no phantom row survives.
    await vi.waitFor(async () => expect(await a.exercise(good)).toBeNull(), within);
    await vi.waitFor(async () => expect(await a.exercise(bad)).toBeNull(), within);
    expect(await b.customIds()).toEqual([]);
  });
});
