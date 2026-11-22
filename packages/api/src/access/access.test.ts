import { sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";

import { createFullAdmin } from "../platform/testing/admin";
import {
  createTestApp,
  linkIn,
  requestSignInCode,
  signIn,
  type TestApp,
  type TestAppOptions,
} from "../platform/testing/harness";

const ADMIN = "owner@example.com";

let app: TestApp | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

/** An invite-only server with a full admin, as the closed beta runs. */
async function closedBeta(options: TestAppOptions = {}) {
  app = await createTestApp({
    ...options,
    config: { registrationOpen: false, adminEmails: [ADMIN], ...options.config },
  });
  const { headers } = await createFullAdmin(app, ADMIN);
  return { app, admin: app.client(headers) };
}

async function inviteRow(a: TestApp, email: string) {
  const [row] = await a.rows(
    sql`SELECT id, state, expires_at, redeemed_at, redeemed_by, token_hash FROM access_invite WHERE email = ${email}`,
  );
  return row;
}

const inviteEmail = (a: TestApp, to: string) =>
  a.waitForEmail((mail) => mail.to === to && mail.subject.includes("invited"));

describe("access requests", () => {
  it("answers the same for a new address, a repeat and an existing account, changing nothing twice", async () => {
    const { app: a } = await closedBeta();
    const anon = a.client();
    for (const email of ["new@example.com", "NEW@example.com", ADMIN]) {
      await expect(anon.access.request({ email })).resolves.toEqual({ received: true });
    }
    const rows = await a.rows(sql`SELECT email, state FROM access_invite ORDER BY email`);
    expect(rows).toEqual([{ email: "new@example.com", state: "requested" }]);
  });

  it("is rate limited per client IP", async () => {
    app = await createTestApp();
    const anon = app.client(new Headers({ "x-client-ip": "203.0.113.9" }));
    for (let index = 0; index < 5; index += 1) {
      await anon.access.request({ email: `r${index}@example.com` });
    }
    await expect(anon.access.request({ email: "r9@example.com" })).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    });
  });
});

describe("invites", () => {
  it("approve sends the invite email with the download link, and the link shows the address", async () => {
    const { app: a, admin } = await closedBeta();
    await a.client().access.request({ email: "tester@example.com" });
    const row = await inviteRow(a, "tester@example.com");
    const approved = await admin.admin.access.approve({ id: String(row?.id) });
    expect(approved.state).toBe("invited");
    const mail = await inviteEmail(a, "tester@example.com");
    expect(mail.text).toContain("http://localhost:3001/download");
    const token = new URL(
      /http:\/\/localhost:3001\/invite\?token=[\w-]+/.exec(mail.text)?.[0] ?? linkIn(mail),
    ).searchParams.get("token");
    await expect(a.client().access.invite({ token: String(token) })).resolves.toEqual({
      email: "tester@example.com",
      state: "invited",
    });
    await expect(admin.admin.access.approve({ id: approved.id })).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("invites directly, resends with a new token and expiry, and revokes", async () => {
    const { app: a, admin } = await closedBeta();
    const invited = await admin.admin.access.invite({ email: "Friend@Example.com" });
    expect(invited).toMatchObject({ email: "friend@example.com", state: "invited" });
    const first = await inviteRow(a, "friend@example.com");
    await a.rows(
      sql`UPDATE access_invite SET expires_at = now() - interval '1 minute' WHERE id = ${invited.id} RETURNING id`,
    );
    expect((await admin.admin.access.list({ state: "expired" })).invites.map((i) => i.id)).toEqual([
      invited.id,
    ]);
    const resent = await admin.admin.access.resend({ id: invited.id });
    expect(resent.state).toBe("invited");
    const second = await inviteRow(a, "friend@example.com");
    expect(second?.token_hash).not.toBe(first?.token_hash);
    expect(new Date(String(second?.expires_at)).getTime()).toBeGreaterThan(
      Date.now() + 13 * 24 * 3600 * 1000,
    );
    const revoked = await admin.admin.access.revoke({ id: invited.id });
    expect(revoked.state).toBe("revoked");
    await expect(requestSignInCode(a, "friend@example.com")).rejects.toMatchObject({
      body: { code: "REGISTRATION_CLOSED" },
    });
    await expect(admin.admin.access.invite({ email: ADMIN })).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });
});

describe("invite-only sign-up", () => {
  it("lets only a live invite create an account, by email code, and redeems it once", async () => {
    const { app: a, admin } = await closedBeta();
    await expect(requestSignInCode(a, "stranger@example.com")).rejects.toMatchObject({
      body: { code: "REGISTRATION_CLOSED" },
    });
    await expect(a.client().auth.registrationStatus()).resolves.toMatchObject({ mode: "invite" });

    await admin.admin.access.invite({ email: "invited@example.com" });
    await signIn(a, "invited@example.com", { name: "Invited" });
    const redeemed = await inviteRow(a, "invited@example.com");
    expect(redeemed?.state).toBe("redeemed");
    expect(redeemed?.redeemed_by).not.toBeNull();

    // Existing accounts keep signing in whatever the invite's state; redemption is not repeated.
    await admin.admin.access.revoke({ id: String(redeemed?.id) }).catch(() => undefined);
    await signIn(a, "invited@example.com");
    expect((await inviteRow(a, "invited@example.com"))?.redeemed_at).toEqual(redeemed?.redeemed_at);
  });

  it("refuses an expired invite", async () => {
    const { app: a, admin } = await closedBeta();
    const invite = await admin.admin.access.invite({ email: "late@example.com" });
    await a.rows(
      sql`UPDATE access_invite SET expires_at = now() - interval '1 second' WHERE id = ${invite.id} RETURNING id`,
    );
    await expect(requestSignInCode(a, "late@example.com")).rejects.toMatchObject({
      body: { code: "REGISTRATION_CLOSED" },
    });
  });

  it("checks a Google sign-up against the provider's verified address", async () => {
    const { app: a, admin } = await closedBeta();
    const context = await a.services.auth.$context;
    const google = (email: string, emailVerified: boolean) =>
      context.internalAdapter.createOAuthUser(
        { email, name: "G", emailVerified, image: null },
        { providerId: "google", accountId: `g-${email}` },
      );
    await expect(google("nobody@example.com", true)).rejects.toMatchObject({
      body: { code: "REGISTRATION_CLOSED" },
    });
    await admin.admin.access.invite({ email: "gmail@example.com" });
    await expect(google("gmail@example.com", false)).rejects.toMatchObject({
      body: { code: "REGISTRATION_CLOSED" },
    });
    await google("gmail@example.com", true);
    expect((await inviteRow(a, "gmail@example.com"))?.state).toBe("redeemed");
  });
});
