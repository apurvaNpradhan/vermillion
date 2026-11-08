import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PowerSyncDatabase } from "@powersync/node";
import {
  claimDeviceOwner,
  createNote,
  deleteNote,
  powerSyncSchema,
  updateNote,
  watchNote,
  watchNotes,
  type LocalNote,
  type NotesPage,
} from "@workspace/sync";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The notes store on real PowerSync (Node SQLite), no services: what Drizzle writes must land in
// the CRUD upload queue exactly as raw SQL did, and live reads must follow only `notes`.

let directory = "";
let database: PowerSyncDatabase;

beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), "vermillion-local-store-"));
  database = new PowerSyncDatabase({
    schema: powerSyncSchema,
    database: { dbFilename: "store.db", dbLocation: directory },
  });
  await database.init();
  await claimDeviceOwner(database, "owner");
});

afterEach(async () => {
  await database.close();
  rmSync(directory, { recursive: true, force: true });
});

describe("Drizzle writes reach the upload queue", () => {
  it("queues a PUT with every column, a PATCH with only the changed ones, and a DELETE", async () => {
    const id = await createNote(database, { title: "First", body: "text" });
    expect(await updateNote(database, id, { title: "First", body: "text" })).toBe(false);
    expect(await updateNote(database, id, { body: "changed" })).toBe(true);
    await deleteNote(database, id);

    const entries = (await database.getCrudBatch(10))?.crud ?? [];
    expect(entries.map((entry) => [entry.op, entry.table, entry.id])).toEqual([
      ["PUT", "notes", id],
      ["PATCH", "notes", id],
      ["DELETE", "notes", id],
    ]);
    expect(entries[0]?.opData).toMatchObject({
      user_id: "owner",
      title: "First",
      body: "text",
    });
    const patch = entries[1]?.opData ?? {};
    expect(Object.keys(patch).sort()).toEqual(["body", "updated_at"]);
    expect(patch["body"]).toBe("changed");
    expect(entries[2]?.opData).toBeUndefined();
    expect((await database.getUploadQueueStats()).count).toBe(3);

    // The old raw INSERT produced the same PUT payload (PowerSync leaves NULL columns out).
    const now = new Date().toISOString();
    await database.execute(
      `INSERT INTO notes (id, user_id, title, body, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL)`,
      ["raw", "owner", "First", "text", now, now],
    );
    const raw = (await database.getCrudBatch(10))?.crud.at(-1);
    expect(Object.keys(raw?.opData ?? {}).sort()).toEqual(
      Object.keys(entries[0]?.opData ?? {}).sort(),
    );
  });

  it("queues nothing for a no-op update or a write that fails validation", async () => {
    const id = await createNote(database, { title: "Same", body: "" });
    const before = (await database.getUploadQueueStats()).count;
    await updateNote(database, id, { title: "Same" });
    await expect(updateNote(database, id, { title: "" })).rejects.toThrow();
    expect((await database.getUploadQueueStats()).count).toBe(before);
  });

  it("commits a create as one transaction", async () => {
    await createNote(database, { title: "One", body: "" });
    const tx = await database.getNextCrudTransaction();
    expect(tx?.crud).toHaveLength(1);
  });
});

describe("live reads", () => {
  it("pages newest first, follows writes to notes and stops when told", async () => {
    const pages: NotesPage[] = [];
    const errors: Error[] = [];
    for (const title of ["a", "b", "c"]) {
      await createNote(database, { title, body: "" });
      await new Promise((resolve) => setTimeout(resolve, 3));
    }
    const stop = watchNotes(database, 2, {
      onPage: (page) => pages.push(page),
      onError: (error) => errors.push(error),
    });
    await vi.waitFor(() => expect(pages).toHaveLength(1));
    expect(pages[0]?.notes.map((n) => n.title)).toEqual(["c", "b"]);
    expect(pages[0]?.hasMore).toBe(true);

    const id = await createNote(database, { title: "d", body: "" });
    await vi.waitFor(() => expect(pages.at(-1)?.notes[0]?.title).toBe("d"));

    // A write to another table does not re-run the notes query.
    const seen = pages.length;
    await claimDeviceOwner(database, "someone-else");
    await database.execute("INSERT INTO install_meta (id, install_id, created_at) VALUES (?,?,?)", [
      "x",
      "y",
      "z",
    ]);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(pages).toHaveLength(seen);

    stop();
    await deleteNote(database, id);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(pages).toHaveLength(seen);
    expect(errors).toEqual([]);
  });

  it("watches one note and reports null once it is gone", async () => {
    const id = await createNote(database, { title: "Mine", body: "" });
    const seen: Array<LocalNote | null> = [];
    const stop = watchNote(database, id, { onNote: (n) => seen.push(n), onError: () => undefined });
    await vi.waitFor(() => expect(seen.at(-1)?.title).toBe("Mine"));
    await updateNote(database, id, { title: "Renamed" });
    await vi.waitFor(() => expect(seen.at(-1)?.title).toBe("Renamed"));
    await deleteNote(database, id);
    await vi.waitFor(() => expect(seen.at(-1)).toBeNull());
    stop();
  });

  it("reports an error instead of a page when a stored row is malformed", async () => {
    await database.execute(
      "INSERT INTO notes (id, user_id, title, created_at, updated_at) VALUES (?,?,?,?,?)",
      ["n1", "owner", null, "t", "t"],
    );
    const errors: Error[] = [];
    const stop = watchNotes(database, 5, {
      onPage: () => undefined,
      onError: (e) => errors.push(e),
    });
    await vi.waitFor(() => expect(errors).toHaveLength(1));
    stop();
  });
});
