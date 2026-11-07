import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createSignedInUser,
  createTestApp,
  linkIn,
  type TestApp,
} from "../platform/testing/harness";

describe("notes", () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => app.close());

  it("creates, reads, updates and deletes the caller's own notes", async () => {
    const client = app.client(await createSignedInUser(app, "writer@example.com"));
    expect(await client.notes.list()).toEqual([]);

    const created = await client.notes.create({ title: "Groceries", body: "Milk" });
    expect(created).toMatchObject({ title: "Groceries", body: "Milk" });
    expect(created.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7/);

    expect(await client.notes.get({ id: created.id })).toEqual(created);

    const updated = await client.notes.update({ id: created.id, title: "Shopping" });
    expect(updated).toMatchObject({ id: created.id, title: "Shopping", body: "Milk" });
    expect(new Date(updated.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(created.updatedAt).getTime(),
    );

    await client.notes.delete({ id: created.id });
    expect(await client.notes.list()).toEqual([]);
    await expect(client.notes.get({ id: created.id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("lists the newest-updated note first", async () => {
    const client = app.client(await createSignedInUser(app, "order@example.com"));
    const first = await client.notes.create({ title: "first", body: "" });
    const second = await client.notes.create({ title: "second", body: "" });
    expect((await client.notes.list()).map((note) => note.id)).toEqual([second.id, first.id]);
    await client.notes.update({ id: first.id, body: "touched" });
    expect((await client.notes.list()).map((note) => note.id)).toEqual([first.id, second.id]);
  });

  it("validates input", async () => {
    const client = app.client(await createSignedInUser(app, "invalid@example.com"));
    await expect(client.notes.create({ title: "   ", body: "" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(client.notes.create({ title: "x".repeat(201), body: "" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(client.notes.get({ id: "not-a-uuid" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("requires a signed-in user", async () => {
    const anonymous = app.client();
    await expect(anonymous.notes.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(anonymous.notes.create({ title: "a", body: "" })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("keeps notes private to their owner", async () => {
    const owner = app.client(await createSignedInUser(app, "owner@example.com"));
    const other = app.client(await createSignedInUser(app, "intruder@example.com"));
    const note = await owner.notes.create({ title: "Secret", body: "plans" });

    expect(await other.notes.list()).toEqual([]);
    await expect(other.notes.get({ id: note.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(other.notes.update({ id: note.id, title: "Hacked" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(other.notes.delete({ id: note.id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });

    expect(await owner.notes.get({ id: note.id })).toEqual(note);
  });

  it("is removed with the account and leaves other users' notes alone", async () => {
    const email = "leaving-notes@example.com";
    const session = await createSignedInUser(app, email);
    const client = app.client(session);
    const stayer = app.client(await createSignedInUser(app, "staying-notes@example.com"));
    const { id: userId } = await client.account.me();
    await client.notes.create({ title: "one", body: "" });
    await client.notes.create({ title: "two", body: "" });
    await stayer.notes.create({ title: "kept", body: "" });

    await client.account.requestDeletion();
    const mail = await app.waitForEmail(
      (m) => m.to === email && /deleting|Löschen/.test(m.subject),
    );
    const response = await app.services.auth.handler(
      new Request(linkIn(mail), { headers: session }),
    );
    expect(response.status).toBeLessThan(400);

    const [row] = await app.rows(
      sql`select count(*)::int as n from notes where user_id = ${userId}`,
    );
    expect(Number(row?.n)).toBe(0);
    expect(await stayer.notes.list()).toHaveLength(1);
  });
});
