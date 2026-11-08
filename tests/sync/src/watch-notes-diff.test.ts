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
  watchNotes,
  type NotesPage,
} from "@workspace/sync";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Differential list watch on real PowerSync (Node SQLite): a write re-runs the query, but rows
// that did not change must come back as the same objects so memoised rows skip rendering.

let directory = "";
let database: PowerSyncDatabase;

beforeEach(async () => {
  directory = mkdtempSync(join(tmpdir(), "vermillion-watch-diff-"));
  database = new PowerSyncDatabase({
    schema: powerSyncSchema,
    database: { dbFilename: "diff.db", dbLocation: directory },
  });
  await database.init();
  await claimDeviceOwner(database, "owner");
});

afterEach(async () => {
  await database.close();
  rmSync(directory, { recursive: true, force: true });
});

const tick = (ms = 3) => new Promise((resolve) => setTimeout(resolve, ms));

async function seed(titles: string[]): Promise<string[]> {
  const ids: string[] = [];
  for (const title of titles) {
    ids.push(await createNote(database, { title, body: "" }));
    await tick();
  }
  return ids;
}

function watch(limit: number) {
  const pages: NotesPage[] = [];
  const errors: Error[] = [];
  const stop = watchNotes(database, limit, {
    onPage: (page) => pages.push(page),
    onError: (error) => errors.push(error),
  });
  return { pages, errors, stop };
}

describe("watchNotes keeps references of unchanged rows", () => {
  it("returns the same objects for untouched rows after one note changes", async () => {
    const ids = await seed(["a", "b", "c", "d"]);
    const { pages, errors, stop } = watch(10);
    await vi.waitFor(() => expect(pages.length).toBeGreaterThan(0));
    const before = pages.at(-1)?.notes ?? [];
    expect(before.map((n) => n.title)).toEqual(["d", "c", "b", "a"]);

    await updateNote(database, ids[1] ?? "", { title: "b2" });
    await vi.waitFor(() => expect(pages.at(-1)?.notes[0]?.title).toBe("b2"));
    const after = pages.at(-1)?.notes ?? [];
    expect(after.map((n) => n.title)).toEqual(["b2", "d", "c", "a"]);
    for (const title of ["a", "c", "d"]) {
      const was = before.find((n) => n.title === title);
      const now = after.find((n) => n.title === title);
      expect(was).toBeDefined();
      expect(now).toBe(was);
    }
    expect(after.find((n) => n.title === "b2")).not.toBe(before.find((n) => n.title === "b"));
    expect(errors).toEqual([]);
    stop();
  });

  it("adds only the inserted row and removes only the deleted one", async () => {
    const ids = await seed(["a", "b", "c"]);
    const { pages, stop } = watch(10);
    await vi.waitFor(() => expect(pages.length).toBeGreaterThan(0));
    const before = pages.at(-1)?.notes ?? [];

    await createNote(database, { title: "d", body: "" });
    await vi.waitFor(() => expect(pages.at(-1)?.notes).toHaveLength(4));
    const inserted = pages.at(-1)?.notes ?? [];
    expect(inserted.map((n) => n.title)).toEqual(["d", "c", "b", "a"]);
    for (const note of before) expect(inserted.find((n) => n.id === note.id)).toBe(note);

    await deleteNote(database, ids[1] ?? "");
    await vi.waitFor(() => expect(pages.at(-1)?.notes).toHaveLength(3));
    const removed = pages.at(-1)?.notes ?? [];
    expect(removed.map((n) => n.title)).toEqual(["d", "c", "a"]);
    for (const note of removed) expect(inserted.find((n) => n.id === note.id)).toBe(note);
    stop();
  });

  it("keeps paging: hasMore from the extra row, references kept when the window shifts", async () => {
    await seed(["a", "b", "c"]);
    const { pages, stop } = watch(2);
    await vi.waitFor(() => expect(pages.length).toBeGreaterThan(0));
    expect(pages.at(-1)?.notes.map((n) => n.title)).toEqual(["c", "b"]);
    expect(pages.at(-1)?.hasMore).toBe(true);
    const kept = pages.at(-1)?.notes[0];

    await createNote(database, { title: "d", body: "" });
    await vi.waitFor(() => expect(pages.at(-1)?.notes[0]?.title).toBe("d"));
    expect(pages.at(-1)?.notes[1]).toBe(kept);
    expect(pages.at(-1)?.hasMore).toBe(true);
    stop();
  });

  it("emits an empty page for an empty list and nothing after stop()", async () => {
    const { pages, stop } = watch(5);
    await vi.waitFor(() => expect(pages).toHaveLength(1));
    expect(pages[0]).toEqual({ notes: [], hasMore: false });

    await createNote(database, { title: "x", body: "" });
    await vi.waitFor(() => expect(pages.at(-1)?.notes).toHaveLength(1));
    const seen = pages.length;
    stop();
    await createNote(database, { title: "y", body: "" });
    await tick(150);
    expect(pages).toHaveLength(seen);
  });

  it("reports an error instead of a page when a stored row is malformed", async () => {
    await database.execute(
      "INSERT INTO notes (id, user_id, title, created_at, updated_at) VALUES (?,?,?,?,?)",
      ["n1", "owner", null, "t", "t"],
    );
    const { pages, errors, stop } = watch(5);
    await vi.waitFor(() => expect(errors.length).toBeGreaterThan(0));
    expect(pages).toEqual([]);
    stop();
  });
});
