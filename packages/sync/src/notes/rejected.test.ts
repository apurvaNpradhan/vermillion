import { describe, expect, it } from "vitest";

import { claimDeviceOwner } from "../platform/device-owner";
import { createFakeDatabase } from "../platform/fake-database";
import { ensureInstallId } from "../platform/install-meta";
import {
  discardRejectedWrite,
  readRejectedWrite,
  watchRejectedWrites,
} from "../platform/rejected-writes";
import { rejectedNoteFields, rejectedRetryValues, retryRejectedNote } from "./rejected";
import { createNote, updateNote, type NotesDatabase } from "./store";

async function setup() {
  const fake = createFakeDatabase();
  await claimDeviceOwner(fake.database, "owner");
  // Safety: the fake implements the methods the store and rejected-write helpers call.
  return { ...fake, notes: fake.database as never as NotesDatabase };
}

type S = Awaited<ReturnType<typeof setup>>;

function reject(
  s: S,
  id: string,
  op: "PUT" | "PATCH" | "DELETE",
  rowId: string,
  payload: string,
  truncated = 0,
) {
  s.sqlite
    .prepare(
      `INSERT INTO rejected_writes VALUES (?, '1', 0, 1, 'notes', ?, ?, 'SYNC_ROW_DELETED', ?, ?, 'now')`,
    )
    .run(id, rowId, op, payload, truncated);
}

const noteRows = (s: S) => s.sqlite.prepare("SELECT * FROM notes").all();
const rejectedCount = (s: S) =>
  Number(s.sqlite.prepare("SELECT count(*) AS n FROM rejected_writes").get()?.["n"]);

describe("rejected writes", () => {
  it("reads the editable fields, but not a truncated or delete payload", async () => {
    const s = await setup();
    reject(s, "a", "PUT", "r1", JSON.stringify({ title: "T", body: "B", user_id: "x" }));
    reject(s, "b", "PUT", "r2", '{"title":"cut', 1);
    reject(s, "c", "DELETE", "r3", "null");
    const read = async (id: string) => {
      const write = await readRejectedWrite(s.notes, id);
      return write ? rejectedNoteFields(write) : "missing";
    };
    expect(await read("a")).toEqual({ title: "T", body: "B" });
    expect(await read("b")).toBeNull();
    expect(await read("c")).toBeNull();
  });

  it("starts the retry form from the rejected fields over the current note", async () => {
    const s = await setup();
    const id = await createNote(s.notes, { title: "Current", body: "old" });
    reject(s, "a", "PATCH", id, JSON.stringify({ body: "mine" }));
    reject(s, "b", "PATCH", "gone-id", JSON.stringify({ body: "orphan" }));
    const values = async (rid: string) => {
      const write = await readRejectedWrite(s.notes, rid);
      return write ? rejectedRetryValues(s.notes, write) : null;
    };
    expect(await values("a")).toEqual({ title: "Current", body: "mine" });
    expect(await values("b")).toEqual({ title: "", body: "orphan" });
  });

  it("lists bounded and reports more", async () => {
    const s = await setup();
    for (const id of ["a", "b", "c"]) reject(s, id, "PUT", id, "{}");
    const results: Array<{ count: number; hasMore: boolean }> = [];
    const database = {
      watchWithCallback: (
        sql: string,
        params: Array<string | number | null>,
        handler: { onResult: (r: { array: unknown[] }) => void },
      ) => handler.onResult({ array: s.sqlite.prepare(sql).all(...params) }),
    };
    const stop = watchRejectedWrites(
      // Safety: only watchWithCallback is called.
      database as never,
      {
        onResult: (r) => results.push({ count: r.writes.length, hasMore: r.hasMore }),
        onError: (error) => {
          throw error;
        },
      },
      2,
    );
    expect(results).toEqual([{ count: 2, hasMore: true }]);
    stop();
  });

  it("retries a rejected create as a new note under a new id and clears the record", async () => {
    const s = await setup();
    reject(s, "a", "PUT", "old-id", JSON.stringify({ title: "T", body: "B" }));
    expect(await retryRejectedNote(s.notes, "a", { title: "T2", body: "B" })).toBe("retried");
    const rows = noteRows(s);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ title: "T2", user_id: "owner" });
    expect(rows[0]?.["id"]).not.toBe("old-id");
    expect(rejectedCount(s)).toBe(0);
    expect(await retryRejectedNote(s.notes, "a", { title: "x", body: "" })).toBe("gone");
    expect(noteRows(s)).toHaveLength(1);
  });

  it("retries a rejected edit on the existing note", async () => {
    const s = await setup();
    const id = await createNote(s.notes, { title: "A", body: "b" });
    reject(s, "a", "PATCH", id, JSON.stringify({ body: "mine" }));
    expect(await retryRejectedNote(s.notes, "a", { title: "A", body: "mine" })).toBe("retried");
    expect(noteRows(s)).toMatchObject([{ id, title: "A", body: "mine" }]);
    expect(rejectedCount(s)).toBe(0);
  });

  it("retries the rejected title without overwriting a concurrently changed body", async () => {
    const s = await setup();
    const id = await createNote(s.notes, { title: "Original", body: "old body" });
    reject(s, "a", "PATCH", id, JSON.stringify({ title: "my title" }));
    const write = await readRejectedWrite(s.notes, "a");
    expect(write).not.toBeNull();
    const baseline = await rejectedRetryValues(s.notes, write!);
    await updateNote(s.notes, id, { body: "remote body", title: "remote title" });

    expect(await retryRejectedNote(s.notes, "a", baseline, baseline)).toBe("retried");
    expect(noteRows(s)).toMatchObject([{ title: "my title", body: "remote body" }]);
  });

  it("also retries a contextual field intentionally edited in the retry form", async () => {
    const s = await setup();
    const id = await createNote(s.notes, { title: "Original", body: "old body" });
    reject(s, "a", "PATCH", id, JSON.stringify({ title: "my title" }));
    const baseline = { title: "my title", body: "old body" };
    await updateNote(s.notes, id, { body: "remote body" });

    await retryRejectedNote(s.notes, "a", { ...baseline, body: "my body" }, baseline);
    expect(noteRows(s)).toMatchObject([{ title: "my title", body: "my body" }]);
  });

  it("preserves the remote title when retrying only a rejected body", async () => {
    const s = await setup();
    const id = await createNote(s.notes, { title: "Original", body: "old" });
    reject(s, "a", "PATCH", id, JSON.stringify({ body: "mine" }));
    const baseline = { title: "Original", body: "mine" };
    await updateNote(s.notes, id, { title: "Remote title" });

    await retryRejectedNote(s.notes, "a", baseline, baseline);
    expect(noteRows(s)).toMatchObject([{ title: "Remote title", body: "mine" }]);
  });

  it("refuses stale retry and discard callbacks even if a rejection id is reused after a reset", async () => {
    const s = await setup();
    const oldScope = await ensureInstallId(s.database);
    await s.database.disconnectAndClear();
    await ensureInstallId(s.database);
    await claimDeviceOwner(s.database, "other");
    reject(s, "a", "PUT", "new-row", JSON.stringify({ title: "Other", body: "" }));
    const values = { title: "Private old draft", body: "" };

    await expect(retryRejectedNote(s.notes, "a", values, values, oldScope)).rejects.toThrow(
      "account changed",
    );
    await expect(discardRejectedWrite(s.notes, "a", oldScope)).rejects.toThrow("account changed");
    expect(rejectedCount(s)).toBe(1);
    expect(noteRows(s)).toHaveLength(0);
  });

  it("saves a rejected edit as a new note when the note is gone", async () => {
    const s = await setup();
    reject(s, "a", "PATCH", "gone-id", JSON.stringify({ body: "mine" }));
    expect(await retryRejectedNote(s.notes, "a", { title: "Kept", body: "mine" })).toBe(
      "saved-as-new",
    );
    expect(noteRows(s)).toMatchObject([{ title: "Kept", body: "mine" }]);
  });

  it("refuses invalid values and keeps the record", async () => {
    const s = await setup();
    reject(s, "a", "PUT", "r", "{}");
    expect(await retryRejectedNote(s.notes, "a", { title: "  ", body: "" })).toBe("invalid");
    expect(await retryRejectedNote(s.notes, "a", { title: "t", body: "x".repeat(10_001) })).toBe(
      "invalid",
    );
    expect(rejectedCount(s)).toBe(1);
    expect(noteRows(s)).toHaveLength(0);
  });

  it("discards only the chosen record", async () => {
    const s = await setup();
    reject(s, "a", "PUT", "r", "{}");
    reject(s, "b", "PUT", "r2", "{}");
    await discardRejectedWrite(s.notes, "a");
    expect(await readRejectedWrite(s.notes, "a")).toBeNull();
    expect(await readRejectedWrite(s.notes, "b")).not.toBeNull();
  });
});
