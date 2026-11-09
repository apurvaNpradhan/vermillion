import { describe, expect, it } from "vitest";

import { claimDeviceOwner } from "../platform/device-owner";
import { createFakeDatabase } from "../platform/fake-database";
import { ensureInstallId } from "../platform/install-meta";
import { createNote, deleteNote, listNotesQuery, updateNote, type NotesDatabase } from "./store";

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

  it("lists live notes newest first by (updated_at, id) with one extra row", async () => {
    const s = await setup();
    for (const title of ["a", "b", "c"]) {
      await createNote(s.notes, { title, body: "" });
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    const query = listNotesQuery(s.notes, 3);
    const { sql, params } = query.toSQL();
    expect(sql).toMatch(/where "notes"."deleted_at" is null/);
    expect(sql).toMatch(/order by "notes"."updated_at" desc, "notes"."id" desc/);
    expect(sql).toMatch(/limit \?/);
    expect(params).toEqual([3]);
    expect((await query).map((note) => note.title)).toEqual(["c", "b", "a"]);
    // The live read itself (watch, stop, table scoping) runs on real PowerSync in tests/sync.
  });

  it("searches title and body case-insensitively, taking wildcards literally", async () => {
    const s = await setup();
    await createNote(s.notes, { title: "Leg Day", body: "squats" });
    await createNote(s.notes, { title: "Groceries", body: "100% oat milk" });
    await createNote(s.notes, { title: "Plan", body: "snake_case" });
    const titles = async (search: string) =>
      (await listNotesQuery(s.notes, 10, search)).map((note) => note.title).sort();

    expect(await titles("leg")).toEqual(["Leg Day"]);
    expect(await titles("SQUATS")).toEqual(["Leg Day"]);
    expect(await titles("100%")).toEqual(["Groceries"]);
    expect(await titles("e_c")).toEqual(["Plan"]);
    expect(await titles("%")).toEqual(["Groceries"]);
    expect(await titles("nothing")).toEqual([]);
    expect(await titles("   ")).toHaveLength(3);
  });

  it("refuses stale create, edit and delete callbacks after another tab switches accounts", async () => {
    const s = await setup();
    const oldScope = await ensureInstallId(s.database);
    const staleCreate = () => createNote(s.notes, { title: "Private draft", body: "" }, oldScope);

    // Another tab resets the shared database and claims it for a different account.
    await s.database.disconnectAndClear();
    const newScope = await ensureInstallId(s.database);
    await claimDeviceOwner(s.database, "other");
    const id = await createNote(s.notes, { title: "Other account", body: "keep" }, newScope);

    await expect(staleCreate()).rejects.toThrow("account changed");
    await expect(updateNote(s.notes, id, { title: "stale" }, oldScope)).rejects.toThrow(
      "account changed",
    );
    await expect(deleteNote(s.notes, id, oldScope)).rejects.toThrow("account changed");
    expect(await listNotesQuery(s.notes, 10)).toMatchObject([
      { id, title: "Other account", body: "keep" },
    ]);
  });

  it("invalidates drafts even when the same owner claims a reset database", async () => {
    const s = await setup();
    const oldScope = await ensureInstallId(s.database);
    await s.database.disconnectAndClear();
    await ensureInstallId(s.database);
    await claimDeviceOwner(s.database, "owner");
    await expect(
      createNote(s.notes, { title: "Before reset", body: "" }, oldScope),
    ).rejects.toThrow("account changed");
  });

  it("refuses values over the limits", async () => {
    const s = await setup();
    await expect(createNote(s.notes, { title: " ", body: "" })).rejects.toThrow("empty");
    await expect(createNote(s.notes, { title: "x", body: "y".repeat(10_001) })).rejects.toThrow();
    await expect(updateNote(s.notes, "id", { title: "" })).rejects.toThrow("Title");
    await expect(updateNote(s.notes, "id", { body: "y".repeat(10_001) })).rejects.toThrow("Body");
  });
});
