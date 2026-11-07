import { sql } from "drizzle-orm";
import { z } from "zod";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createSignedInUser,
  createTestApp,
  PASSWORD,
  type TestApp,
} from "../platform/testing/harness";

const signUpBody = z.object({
  token: z.string().nullable(),
  user: z.object({ emailVerified: z.boolean() }).loose(),
});
type SignUpBody = z.infer<typeof signUpBody>;

describe("account enumeration", () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => app.close());

  const signUp = (email: string) =>
    app.services.auth.api.signUpEmail({
      body: { email, password: PASSWORD, name: "Someone" },
      asResponse: true,
    });

  it("answers a sign-up for an existing email exactly like one for a new email", async () => {
    await createSignedInUser(app, "taken@example.com");
    const existing = await signUp("taken@example.com");
    const fresh = await signUp("fresh@example.com");

    expect(existing.status).toBe(fresh.status);
    const existingBody: SignUpBody = signUpBody.parse(await existing.json());
    const freshBody: SignUpBody = signUpBody.parse(await fresh.json());
    expect(existingBody.token).toBeNull();
    expect(freshBody.token).toBeNull();
    expect(Object.keys(existingBody.user).toSorted()).toEqual(
      Object.keys(freshBody.user).toSorted(),
    );
    expect(existingBody.user.emailVerified).toBe(false);
    for (const field of [
      "role",
      "banned",
      "banReason",
      "banExpires",
      "image",
      "name",
      "emailVerified",
    ]) {
      expect(existingBody.user[field]).toEqual(freshBody.user[field]);
    }
    // Neither response starts a session.
    expect(existing.headers.getSetCookie()).toEqual([]);
    expect(fresh.headers.getSetCookie()).toEqual([]);
  });

  it("does not expose the role or verified state of an existing administrator", async () => {
    const adminApp = await createTestApp({ config: { adminEmails: ["root@example.com"] } });
    try {
      const session = await createSignedInUser(adminApp, "root@example.com");
      expect((await adminApp.client(session).account.me()).role).toBe("admin");
      const existing = await adminApp.services.auth.api.signUpEmail({
        body: { email: "root@example.com", password: PASSWORD, name: "Someone" },
      });
      expect(existing.token).toBeNull();
      expect(existing.user).toMatchObject({
        role: "user",
        emailVerified: false,
        banned: false,
        banReason: null,
        banExpires: null,
      });
    } finally {
      await adminApp.close();
    }
  });

  it("creates no second account and tells the real owner instead", async () => {
    await createSignedInUser(app, "owner@example.com");
    await signUp("owner@example.com");
    expect(
      await app.rows(sql`select 1 from "user" where email = 'owner@example.com'`),
    ).toHaveLength(1);
    const notice = await app.waitForEmail(
      (m) => m.to === "owner@example.com" && m.subject.includes("Someone tried to sign up"),
    );
    expect(notice.text).toContain("Nothing changed");
  });

  it("answers password reset the same for unknown and known emails", async () => {
    await createSignedInUser(app, "known@example.com");
    const known = await app.services.auth.api.requestPasswordReset({
      body: { email: "known@example.com" },
    });
    const unknown = await app.services.auth.api.requestPasswordReset({
      body: { email: "unknown@example.com" },
    });
    expect(unknown).toEqual(known);
    await app.waitForEmail((m) => m.to === "known@example.com" && m.subject.includes("Reset"));
    expect(app.outbox.some((m) => m.to === "unknown@example.com")).toBe(false);
  });

  it("refuses unverified sign-in the same way for wrong passwords and unknown emails", async () => {
    await app.services.auth.api.signUpEmail({
      body: { email: "pending@example.com", password: PASSWORD, name: "P" },
    });
    const attempt = (email: string, password: string) =>
      app.services.auth.api
        .signInEmail({ body: { email, password } })
        .catch((error: { statusCode: number; body: { code: string } }) => ({
          status: error.statusCode,
          code: error.body.code,
        }));
    const wrong = await attempt("pending@example.com", "not-the-password-0");
    const unknown = await attempt("nobody@example.com", "not-the-password-0");
    expect(wrong).toEqual(unknown);
  });
});
