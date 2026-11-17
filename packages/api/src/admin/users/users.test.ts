import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createFullAdmin } from "../../platform/testing/admin";
import {
  createSignedInUser,
  createTestApp,
  requestSignInCode,
  type TestApp,
} from "../../platform/testing/harness";

const ADMIN = "owner@example.com";
const OTHER_ADMIN = "second@example.com";

let app: TestApp;
let admin: ReturnType<TestApp["client"]>;
let adminId: string;

const idOf = async (email: string) =>
  String((await app.rows(sql`SELECT id FROM "user" WHERE email = ${email}`))[0]?.id);

beforeAll(async () => {
  app = await createTestApp({
    config: {
      adminEmails: [ADMIN, OTHER_ADMIN],
      sync: {
        endpoint: "http://127.0.0.1:8090",
        slotLag: { warnBytes: 1024 ** 3, criticalBytes: 3 * 1024 ** 3 },
      },
    },
  });
  admin = app.client((await createFullAdmin(app, ADMIN)).headers);
  adminId = await idOf(ADMIN);
}, 60_000);
afterAll(async () => app?.close());

async function rejection(call: Promise<object>) {
  return call.then(
    () => {
      throw new Error("expected a failure");
    },
    (error: Error) => error,
  );
}

describe("admin users", () => {
  it("shows an account without any training field, with the app version last seen", async () => {
    const headers = await createSignedInUser(app, "viewer@example.com", "Viewer");
    headers.set("x-app-version", "1.2.0+45");
    await app.client(headers).preferences.get();
    await app.services.background.drain(2_000);
    const view = await admin.admin.users.get({ userId: await idOf("viewer@example.com") });
    expect(Object.keys(view).sort()).toEqual(
      [
        "banReason",
        "banned",
        "counts",
        "createdAt",
        "email",
        "id",
        "lastSeenAppAt",
        "lastSeenAppVersion",
        "lastSignInAt",
        "lastSignInMethod",
        "name",
        "role",
      ].sort(),
    );
    expect(view).toMatchObject({
      email: "viewer@example.com",
      lastSeenAppVersion: "1.2.0+45",
      lastSignInMethod: "email-otp",
      counts: { programs: 0, sessions: 0, customExercises: 0, media: 0 },
    });
    const listed = await admin.admin.users.list({ search: "VIEWER" });
    expect(listed.users.map((user) => user.email)).toEqual(["viewer@example.com"]);
  });

  it("bans: sessions end, sign-in and sync credentials are refused; unban lets them back", async () => {
    const headers = await createSignedInUser(app, "banned@example.com", "Banned");
    const userId = await idOf("banned@example.com");
    await admin.admin.users.ban({ userId, reason: "spam" });

    expect(await rejection(app.client(headers).sync.credentials())).toMatchObject({
      code: "UNAUTHORIZED",
    });
    const otp = await requestSignInCode(app, "banned@example.com");
    await expect(
      app.services.auth.api.signInEmailOTP({ body: { email: "banned@example.com", otp } }),
    ).rejects.toMatchObject({ body: { code: "BANNED_USER" } });

    // Even a session that survived (made before the ban) gets no sync token.
    await admin.admin.users.unban({ userId });
    const again = await createSignedInUser(app, "banned@example.com");
    await app.rows(sql`UPDATE "user" SET banned = true WHERE id = ${userId} RETURNING id`);
    expect(await rejection(app.client(again).sync.credentials())).toMatchObject({
      code: "FORBIDDEN",
      data: { code: "BANNED_USER" },
    });
    await app.rows(sql`UPDATE "user" SET banned = false WHERE id = ${userId} RETURNING id`);
    expect((await app.client(again).sync.credentials()).userId).toBe(userId);
  });

  it("revokes every session of an account", async () => {
    const headers = await createSignedInUser(app, "revoked@example.com", "Revoked");
    const { revoked } = await admin.admin.users.revokeSessions({
      userId: await idOf("revoked@example.com"),
    });
    expect(revoked).toBeGreaterThanOrEqual(1);
    expect(await rejection(app.client(headers).account.me())).toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("refuses acting on the admin's own account or another listed admin", async () => {
    for (const call of [
      () => admin.admin.users.ban({ userId: adminId, reason: "slip" }),
      () => admin.admin.users.revokeSessions({ userId: adminId }),
      () => admin.admin.users.delete({ userId: adminId, email: ADMIN }),
    ]) {
      expect(await rejection(call())).toMatchObject({
        code: "FORBIDDEN",
        data: { code: "ADMIN_SELF_ACTION" },
      });
    }
    await createSignedInUser(app, OTHER_ADMIN, "Second");
    expect(
      await rejection(admin.admin.users.ban({ userId: await idOf(OTHER_ADMIN), reason: "x" })),
    ).toMatchObject({ code: "FORBIDDEN", data: { code: "ADMIN_TARGET_IS_ADMIN" } });
    const [audit] = await app.rows(
      sql`SELECT count(*)::int AS n FROM admin_audit WHERE action = 'user.ban' AND target_id = ${adminId}`,
    );
    expect(audit?.n).toBe(0);
  });

  it("deletes an account and its rows through the app's deletion path", async () => {
    await createSignedInUser(app, "leaving@example.com", "Leaving");
    const userId = await idOf("leaving@example.com");
    await app.client(await createSignedInUser(app, "leaving@example.com")).preferences.update({
      timezone: "Europe/Berlin",
    });
    expect(
      await rejection(admin.admin.users.delete({ userId, email: "someone@example.com" })),
    ).toMatchObject({ code: "BAD_REQUEST" });
    await admin.admin.users.delete({ userId, email: "LEAVING@example.com" });
    const [left] = await app.rows(sql`
      SELECT (SELECT count(*) FROM "user" WHERE id = ${userId})::int AS users,
             (SELECT count(*) FROM session WHERE user_id = ${userId})::int AS sessions,
             (SELECT count(*) FROM user_preferences WHERE user_id = ${userId})::int AS prefs`);
    expect(left).toEqual({ users: 0, sessions: 0, prefs: 0 });
    const [audit] = await app.rows(
      sql`SELECT count(*)::int AS n FROM admin_audit WHERE action = 'user.delete' AND target_id = ${userId}`,
    );
    expect(audit?.n).toBe(1);
  });
});
