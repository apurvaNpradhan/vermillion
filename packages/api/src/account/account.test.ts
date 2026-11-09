import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createSignedInUser,
  createTestApp,
  linkIn,
  signIn,
  type TestApp,
} from "../platform/testing/harness";

describe("account deletion", () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => app.close());

  const count = async (table: string, userId: string) =>
    Number(
      (
        await app.rows(
          sql`select count(*)::int as n from ${sql.identifier(table)} where user_id = ${userId}`,
        )
      )[0]?.n,
    );

  async function cleanupJobStates() {
    const rows = await app.rows(sql`select state from pgboss.job where name = 'account.cleanup'`);
    return rows.map((row) => row.state);
  }

  it("needs the emailed confirmation, then removes data, revokes sessions and runs the cleanup job", async () => {
    const email = "leaving@example.com";
    const session = await createSignedInUser(app, email);
    const client = app.client(session);
    const { id: userId } = await client.account.me();
    await client.preferences.update({ locale: "en", ui: { sidebarCollapsed: true } });
    const otherSession = await signIn(app, email);

    // Asking only sends the email; nothing is deleted yet.
    await client.account.requestDeletion();
    const mail = await app.waitForEmail(
      (m) => m.to === email && /deleting|Löschen/.test(m.subject),
    );
    expect(await count("user_preferences", userId)).toBe(1);
    expect((await client.account.me()).id).toBe(userId);

    // Following the link deletes the account.
    const response = await app.services.auth.handler(
      new Request(linkIn(mail), { headers: session }),
    );
    expect(response.status).toBeLessThan(400);

    expect(await count("user_preferences", userId)).toBe(0);
    expect(await app.rows(sql`select id from "user" where id = ${userId}`)).toHaveLength(0);
    expect(await count("session", userId)).toBe(0);
    expect(await count("auth_email_outbox", userId)).toBe(0);
    const retainedPayloads = JSON.stringify(
      await app.rows(sql`select data::text as payload from pgboss.job`),
    );
    expect(retainedPayloads).not.toContain(email);
    expect(retainedPayloads).not.toContain(linkIn(mail));
    await expect(client.account.me()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(app.client(otherSession).account.me()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    // The address is free again: signing in with it starts a new, empty account.
    const again = await signIn(app, email);
    expect((await app.client(again).account.me()).id).not.toBe(userId);
    expect(await count("user_preferences", userId)).toBe(0);

    // The cleanup job was queued and ran to completion.
    await expect.poll(cleanupJobStates, { timeout: 10_000 }).toContain("completed");
  });

  it("redeems a native deletion link with app credentials and no browser cookie jar", async () => {
    const email = "native-leaving@example.com";
    const session = await createSignedInUser(app, email);
    const client = app.client(session);
    const { id } = await client.account.me();
    await client.account.requestDeletion({ callbackURL: "vermillion://confirm-deletion" });
    const mail = await app.waitForEmail(
      (m) => m.to === email && /deleting|Löschen/.test(m.subject),
    );
    const token = /vermillion:\/\/confirm-deletion\?token=([a-z0-9]+)/.exec(mail.text)?.[1];
    expect(token).toBeTruthy();
    await expect(app.client().account.confirmDeletion({ token: token! })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await expect(client.account.confirmDeletion({ token: token! })).resolves.toMatchObject({
      success: true,
    });
    expect(await app.rows(sql`select id from "user" where id = ${id}`)).toEqual([]);
    await expect(client.account.me()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(await app.rows(sql`select id from auth_email_outbox where user_id = ${id}`)).toEqual([]);
    const retained = JSON.stringify(
      await app.rows(sql`select data::text as payload from pgboss.job`),
    );
    expect(retained).not.toContain(email);
    expect(retained).not.toContain(token!);
  });

  it("emails the confirmation in the account's saved language", async () => {
    const email = "en-leaving@example.com";
    const session = await createSignedInUser(app, email);
    const client = app.client(session);
    await client.preferences.update({ locale: "en" });
    await client.account.requestDeletion();
    const mail = await app.waitForEmail((m) => m.to === email && m.subject.includes("deleting"));
    expect(mail.text).toContain("Delete my account");
  });

  describe("confirmation callback", () => {
    const scheme = "vermillion";
    const confirmationFor = async (email: string, callbackURL: string) => {
      const client = app.client(await createSignedInUser(app, email));
      await client.account.requestDeletion({ callbackURL });
      const mail = await app.waitForEmail(
        (m) => m.to === email && /deleting|Löschen/.test(m.subject),
      );
      return new URL(linkIn(mail)).searchParams.get("callbackURL");
    };

    it("accepts an in-app path and a deep link into the app's own scheme", async () => {
      expect(await confirmationFor("cb-path@example.com", "/?account=deleted")).toBe(
        "/?account=deleted",
      );
      expect(await confirmationFor("cb-link@example.com", `${scheme}://account-deleted`)).toBe(
        `${scheme}://account-deleted`,
      );
    });

    it.each([
      "https://evil.example/",
      "//evil.example",
      "/\\evil.example",
      "javascript:alert(1)",
      "exp://192.168.0.2:8081/--/x",
      "evil://account-deleted",
      "vermillion.evil://x",
      "vermillion:/x",
      `${scheme}://evil@host`,
      `${scheme}://x y`,
    ])("rejects %s", async (callbackURL) => {
      const client = app.client(
        await createSignedInUser(app, `cb-bad-${Math.random()}@example.com`),
      );
      await expect(client.account.requestDeletion({ callbackURL })).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    });
  });

  it("updates the profile name", async () => {
    const client = app.client(await createSignedInUser(app, "rename@example.com"));
    await client.account.updateProfile({ name: "Ada Lovelace" });
    expect((await client.account.me()).name).toBe("Ada Lovelace");
  });
});
