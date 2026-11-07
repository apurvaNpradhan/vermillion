import { reconcileAdminRoles } from "@workspace/auth";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createSignedInUser,
  createTestApp,
  PASSWORD,
  signIn,
  type TestApp,
} from "../platform/testing/harness";

const ADMIN = "boss@example.com";

describe("admin", () => {
  let app: TestApp;
  let adminSession: Headers;
  beforeAll(async () => {
    app = await createTestApp({ config: { adminEmails: [ADMIN] } });
    adminSession = await createSignedInUser(app, ADMIN, "Boss");
  });
  afterAll(async () => app.close());

  const roleOf = async (email: string) =>
    (await app.rows(sql`select role from "user" where email = ${email}`))[0]?.role;

  describe("allowlist", () => {
    it("grants the role to a verified listed email when the session is created", async () => {
      expect(await roleOf(ADMIN)).toBe("admin");
      await expect(app.client(adminSession).admin.access()).resolves.toEqual({ admin: true });
    });

    it("never grants it to an unverified account with a listed email", async () => {
      await app.services.auth.api.signUpEmail({
        body: { email: "unverified@example.com", password: PASSWORD, name: "U" },
      });
      await reconcileAdminRoles(app.services.db, ["unverified@example.com"]);
      expect(await roleOf("unverified@example.com")).toBe("user");
    });

    /** Changes the allowlist in place (the auth hooks read the same array) and reconciles. */
    const setAllowlist = async (...emails: string[]) => {
      app.services.config.adminEmails.splice(0, Infinity, ...emails);
      await reconcileAdminRoles(app.services.db, emails);
    };

    it("reconciles roles at boot: promotes listed users and revokes removed ones", async () => {
      const second = await createSignedInUser(app, "second@example.com");
      await setAllowlist(ADMIN, "second@example.com");
      await expect(app.client(second).admin.access()).resolves.toEqual({ admin: true });

      await setAllowlist(ADMIN);
      await expect(app.client(second).admin.access()).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(app.client(adminSession).admin.access()).resolves.toEqual({ admin: true });
    });

    it("re-checks on a new session, so removing an email revokes admin on next sign-in", async () => {
      const temp = await createSignedInUser(app, "temp-admin@example.com");
      await setAllowlist(ADMIN, "temp-admin@example.com");
      expect(await roleOf("temp-admin@example.com")).toBe("admin");
      app.services.config.adminEmails.splice(0, Infinity, ADMIN);
      await signIn(app, "temp-admin@example.com");
      expect(await roleOf("temp-admin@example.com")).toBe("user");
      await expect(app.client(temp).admin.access()).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("refuses an admin whose email changed to one that is not on the allowlist", async () => {
      const other = await createSignedInUser(app, "renamer@example.com");
      await setAllowlist(ADMIN, "renamer@example.com");
      await expect(app.client(other).admin.access()).resolves.toEqual({ admin: true });
      const { id } = await app.client(other).account.me();

      await app.services.auth.api.adminUpdateUser({
        headers: adminSession,
        body: { userId: id, data: { email: "renamed@example.com" } },
      });

      await expect(app.client(other).admin.access()).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(await roleOf("renamed@example.com")).toBe("user");
      await setAllowlist(ADMIN);
    });

    it("blocks role assignment and impersonation through Better Auth", async () => {
      const victim = await createSignedInUser(app, "victim@example.com");
      const { id } = await app.client(victim).account.me();
      await expect(
        app.services.auth.api.setRole({
          headers: adminSession,
          body: { userId: id, role: "admin" },
        }),
      ).rejects.toMatchObject({ body: { code: "ADMIN_ROLE_MANAGED" } });
      await expect(
        app.services.auth.api.impersonateUser({ headers: adminSession, body: { userId: id } }),
      ).rejects.toMatchObject({ body: { code: "ADMIN_ROLE_MANAGED" } });
    });
  });

  describe("access", () => {
    it("refuses anonymous and non-admin callers on every admin procedure", async () => {
      const user = app.client(await createSignedInUser(app, "plain@example.com"));
      const anonymous = app.client();
      for (const caller of [
        { client: user, code: "FORBIDDEN" },
        { client: anonymous, code: "UNAUTHORIZED" },
      ]) {
        await expect(caller.client.admin.access()).rejects.toMatchObject({ code: caller.code });
        await expect(caller.client.admin.users.list({ page: 1, limit: 10 })).rejects.toMatchObject({
          code: caller.code,
        });
        await expect(caller.client.admin.users.ban({ userId: "x" })).rejects.toMatchObject({
          code: caller.code,
        });
        await expect(caller.client.admin.users.unban({ userId: "x" })).rejects.toMatchObject({
          code: caller.code,
        });
        await expect(caller.client.admin.users.remove({ userId: "x" })).rejects.toMatchObject({
          code: caller.code,
        });
      }
    });
  });

  describe("users", () => {
    it("lists with search and pagination", async () => {
      for (const name of ["alpha", "beta", "gamma"])
        await createSignedInUser(app, `${name}-list@example.com`);
      const admin = app.client(adminSession).admin.users;

      const found = await admin.list({ search: "beta-list", page: 1, limit: 10 });
      expect(found.users.map((u) => u.email)).toEqual(["beta-list@example.com"]);
      expect(found.total).toBe(1);

      const first = await admin.list({ search: "-list@", page: 1, limit: 2 });
      const second = await admin.list({ search: "-list@", page: 2, limit: 2 });
      expect(first.total).toBe(3);
      expect(first.users).toHaveLength(2);
      expect(second.users).toHaveLength(1);
      expect(new Set([...first.users, ...second.users].map((u) => u.id)).size).toBe(3);
    });

    it("bans (revoking sessions at once), blocks sign-in, and unbans", async () => {
      const email = "banned@example.com";
      const session = await createSignedInUser(app, email);
      const { id } = await app.client(session).account.me();
      const admin = app.client(adminSession).admin.users;

      await admin.ban({ userId: id, reason: "spam" });
      await expect(app.client(session).account.me()).rejects.toMatchObject({
        code: "UNAUTHORIZED",
      });
      await expect(signIn(app, email)).rejects.toThrow();
      const [listed] = (await admin.list({ search: email, page: 1, limit: 1 })).users;
      expect(listed).toMatchObject({ banned: true, banReason: "spam" });

      await admin.unban({ userId: id });
      const again = await signIn(app, email);
      expect((await app.client(again).account.me()).id).toBe(id);
    });

    it("refuses to ban yourself and reports unknown users", async () => {
      const admin = app.client(adminSession).admin.users;
      const { id } = await app.client(adminSession).account.me();
      await expect(admin.ban({ userId: id })).rejects.toMatchObject({ code: "BAD_REQUEST" });
      await expect(admin.ban({ userId: "does-not-exist" })).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    it("deletes a user with their data and runs the cleanup", async () => {
      const email = "spam@example.com";
      const session = await createSignedInUser(app, email);
      const { id } = await app.client(session).account.me();
      await app.client(session).preferences.update({ locale: "de" });

      await app.client(adminSession).admin.users.remove({ userId: id });

      expect(await app.rows(sql`select 1 from "user" where id = ${id}`)).toHaveLength(0);
      expect(
        await app.rows(sql`select 1 from user_preferences where user_id = ${id}`),
      ).toHaveLength(0);
      await expect(app.client(session).account.me()).rejects.toMatchObject({
        code: "UNAUTHORIZED",
      });
      await expect
        .poll(
          async () =>
            (await app.rows(sql`select state from pgboss.job where name = 'account.cleanup'`)).map(
              (row) => row.state,
            ),
          { timeout: 10_000 },
        )
        .toContain("completed");
    });

    it("refuses to delete yourself", async () => {
      const { id } = await app.client(adminSession).account.me();
      await expect(
        app.client(adminSession).admin.users.remove({ userId: id }),
      ).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    });
  });
});
