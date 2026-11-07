import { describe, expect, it } from "vitest";

import { claimDeviceOwner } from "../platform/device-owner";
import { createFakeDatabase } from "../platform/fake-database";
import { createNote, deleteNote, updateNote, watchNotes, type NotesDatabase } from "./store";

async function setup() {
  const fake = createFakeDatabase();
  await claimDeviceOwner(fake.database, "owner");
  // Safety: the fake implements the NotesDatabase methods the store calls.
  return { ...fake, notes: fake.database as never as NotesDatabase };
}

const row = (s: Awaited<ReturnType<typeof setup>>, id: string) =>
  s.sqlite.prepare("SELECT * FROM notes WHERE id = ?").get(id);

describe("notes store", () => {
  it("creates with a UUIDv7 id, the Device owner and matching timestamps", async () => {
    const s = await setup();
    const id = await createNote(s.notes, { title: "Hello", body: "" });
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    const created = row(s, id);
    expect(created).toMatchObject({ user_id: "owner", title: "Hello", deleted_at: null });
    expect(created?.["created_at"]).toBe(created?.["updated_at"]);
  });

  it("refuses to create without a Device owner", async () => {
    const fake = createFakeDatabase();
    await expect(
      createNote(fake.database as never as NotesDatabase, { title: "x", body: "" }),
    ).rejects.toThrow("Device owner");
  });

  it("updates only the fields that changed", async () => {
    const s = await setup();
    const id = await createNote(s.notes, { title: "A", body: "b" });
    const before = row(s, id);

    expect(await updateNote(s.notes, id, { title: "A", body: "b" })).toBe(false);
    expect(row(s, id)).toEqual(before);

    expect(await updateNote(s.notes, id, { title: "A", body: "c" })).toBe(true);
    expect(row(s, id)).toMatchObject({ title: "A", body: "c" });
    expect(await updateNote(s.notes, id, {})).toBe(false);
    expect(await updateNote(s.notes, "01900000-0000-7000-8000-00000000dead", { title: "x" })).toBe(
      false,
    );
  });

  it("deletes", async () => {
    const s = await setup();
    const id = await createNote(s.notes, { title: "A", body: "" });
    await deleteNote(s.notes, id);
    expect(row(s, id)).toBeUndefined();
  });

  it("watches a bounded page and says whether more exist", async () => {
    const s = await setup();
    let query = "";
    let params: Array<string | number | null> = [];
    const pages: Array<{ count: number; hasMore: boolean }> = [];
    const database = {
      watchWithCallback: (
        sql: string,
        p: Array<string | number | null>,
        handler: { onResult: (r: { array: unknown[] }) => void },
      ) => {
        query = sql;
        params = p;
        const rows = s.sqlite.prepare(sql).all(...p);
        handler.onResult({ array: rows });
      },
    };
    for (const title of ["a", "b", "c"]) {
      await createNote(s.notes, { title, body: "" });
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    const stop = watchNotes(database as never, 2, {
      onPage: (page) => pages.push({ count: page.notes.length, hasMore: page.hasMore }),
      onError: (error) => {
        throw error;
      },
    });
    expect(pages).toEqual([{ count: 2, hasMore: true }]);
    expect(params).toEqual([3]);
    expect(query).toMatch(/deleted_at IS NULL/);
    expect(query).toMatch(/ORDER BY updated_at DESC, id DESC/);
    expect(query).toMatch(/LIMIT \?/);
    stop();
  });
});
