import { describe, expect, it } from "vitest";

import { claimDeviceOwner } from "../platform/device-owner";
import { createFakeDatabase } from "../platform/fake-database";
import { applyLatest, draftPatch, editDraft, isDraftDirty, startDraft } from "./draft";
import { createNote, updateNote, type LocalNote, type NotesDatabase } from "./store";

const note = (title: string, body: string): LocalNote => ({
  id: "n",
  title,
  body,
  createdAt: "t",
  updatedAt: "t",
});

describe("note draft", () => {
  it("sends only the fields changed since the edit started", () => {
    let draft = startDraft(note("A", "b"));
    expect(draftPatch(draft)).toEqual({});
    expect(isDraftDirty(draft)).toBe(false);
    draft = editDraft(draft, "title", "B");
    expect(draftPatch(draft)).toEqual({ title: "B" });
    draft = editDraft(draft, "title", "A");
    expect(isDraftDirty(draft)).toBe(false);
  });

  it("lets untouched fields follow the row and keeps edited ones", () => {
    let draft = editDraft(startDraft(note("A", "b")), "title", "mine");
    draft = applyLatest(draft, note("theirs", "newer body"));
    expect(draft.values).toEqual({ title: "mine", body: "newer body" });
    // The newer body is the new baseline for body, so it is not part of the patch.
    expect(draftPatch(draft)).toEqual({ title: "mine" });
  });

  it("marks the draft deleted and recovers if the row returns", () => {
    const draft = applyLatest(editDraft(startDraft(note("A", "b")), "body", "x"), null);
    expect(draft.deleted).toBe(true);
    expect(draft.values.body).toBe("x");
    expect(applyLatest(draft, note("A", "b")).deleted).toBe(false);
  });

  it("keeps both devices' edits when each changes a different field", async () => {
    const fake = createFakeDatabase();
    await claimDeviceOwner(fake.database, "owner");
    // Safety: the fake implements the NotesDatabase methods the store calls.
    const db = fake.database as never as NotesDatabase;
    const id = await createNote(db, { title: "A", body: "b" });

    // Two open forms start from the same baseline.
    const formOne = editDraft(startDraft(note("A", "b")), "title", "A2");
    const formTwo = editDraft(startDraft(note("A", "b")), "body", "b2");

    await updateNote(db, id, draftPatch(formOne));
    await updateNote(db, id, draftPatch(formTwo));

    expect(fake.sqlite.prepare("SELECT title, body FROM notes WHERE id = ?").get(id)).toMatchObject(
      { title: "A2", body: "b2" },
    );
  });
});
