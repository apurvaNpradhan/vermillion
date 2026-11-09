import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  codeIn,
  createSignedInUser,
  createTestApp,
  requestSignInCode,
  signIn,
  type TestApp,
} from "../platform/testing/harness";

describe("email code sign-in", () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => app.close());

  const redeem = (email: string, otp: string, name?: string) =>
    app.services.auth.api.signInEmailOTP({
      body: { email, otp, ...(name ? { name } : {}) },
      asResponse: true,
    });

  it("creates a verified account on first redeem, with the name that was given", async () => {
    const otp = await requestSignInCode(app, "new@example.com");
    const response = await redeem("new@example.com", otp, "Ada");
    expect(response.ok).toBe(true);
    expect(
      await app.rows(sql`select name, email_verified from "user" where email = 'new@example.com'`),
    ).toEqual([{ name: "Ada", email_verified: true }]);
  });

  it("allows an empty name, so onboarding can ask for it", async () => {
    const session = await signIn(app, "nameless@example.com");
    expect((await app.client(session).account.me()).name).toBe("");
  });

  it("sends no sign-in notice for the sign-up itself, and one for later sign-ins", async () => {
    const email = "notice-once@example.com";
    await signIn(app, email);
    await app.services.background.drain();
    await app.services.jobs.drain(["auth.deliver-email"], 5000);
    expect(
      app.outbox.filter((m) => m.to === email && m.subject.includes("New sign-in")),
    ).toHaveLength(0);
    await app.rows(
      sql`update "user" set created_at = now() - interval '1 hour' where email = ${email}`,
    );
    await signIn(app, email);
    await app.waitForEmail((m) => m.to === email && m.subject.includes("New sign-in"));
  });

  it("accepts a code once", async () => {
    const otp = await requestSignInCode(app, "once@example.com");
    expect((await redeem("once@example.com", otp)).ok).toBe(true);
    await expect(
      app.services.auth.api.signInEmailOTP({ body: { email: "once@example.com", otp } }),
    ).rejects.toMatchObject({ body: { code: "INVALID_OTP" } });
  });

  it("burns a code after three wrong guesses", async () => {
    const email = "guesser@example.com";
    const otp = await requestSignInCode(app, email);
    const wrong = otp === "000000" ? "111111" : "000000";
    for (let attempt = 0; attempt < 3; attempt++) {
      await expect(
        app.services.auth.api.signInEmailOTP({ body: { email, otp: wrong } }),
      ).rejects.toMatchObject({ body: { code: "INVALID_OTP" } });
    }
    await expect(
      app.services.auth.api.signInEmailOTP({ body: { email, otp } }),
    ).rejects.toMatchObject({ body: { code: "TOO_MANY_ATTEMPTS" } });
  });

  it("issues a fresh code on resend and retires the old one", async () => {
    const email = "resend@example.com";
    const first = await requestSignInCode(app, email);
    let second = await requestSignInCode(app, email);
    while (second === first) second = await requestSignInCode(app, email);
    await expect(
      app.services.auth.api.signInEmailOTP({ body: { email, otp: first } }),
    ).rejects.toMatchObject({ body: { code: "INVALID_OTP" } });
    expect((await redeem(email, second)).ok).toBe(true);
  });

  it("stores the code hashed", async () => {
    const otp = await requestSignInCode(app, "hashed@example.com");
    const rows = await app.rows(
      sql`select value from verification where identifier like '%hashed@example.com'`,
    );
    expect(rows).toHaveLength(1);
    expect(String(rows[0]?.value)).not.toContain(otp);
  });

  it("signs an existing account in with the language it saved", async () => {
    const email = "english@example.com";
    const session = await createSignedInUser(app, email);
    await app.client(session).preferences.update({ locale: "en" });
    const seen = app.outbox.length;
    await app.services.auth.api.sendVerificationOTP({ body: { email, type: "sign-in" } });
    const mail = await app.waitForEmail((m) => m.to === email && app.outbox.indexOf(m) >= seen);
    expect(mail.subject).toBe(`${codeIn(mail)} is your Vermillion code`);
  });

  describe("changing the email address", () => {
    it("sends the code to the new address, then tells the old one", async () => {
      const email = "before@example.com";
      const session = await createSignedInUser(app, email);
      const seen = app.outbox.length;
      await app.services.auth.api.requestEmailChangeEmailOTP({
        headers: session,
        body: { newEmail: "after@example.com" },
      });
      const mail = await app.waitForEmail(
        (m) => m.to === "after@example.com" && app.outbox.indexOf(m) >= seen,
      );
      expect(mail.text).not.toMatch(/https?:\/\//);
      await app.services.auth.api.changeEmailEmailOTP({
        headers: session,
        body: { newEmail: "after@example.com", otp: codeIn(mail) },
      });
      expect(
        await app.rows(
          sql`select email, email_verified from "user" where email = 'after@example.com'`,
        ),
      ).toEqual([{ email: "after@example.com", email_verified: true }]);
      const notice = await app.waitForEmail(
        (m) => m.to === email && m.subject.includes("Security notice"),
      );
      expect(notice.text).toContain("email address");
    });

    it("tells nobody when the code is wrong", async () => {
      const email = "stays@example.com";
      const session = await createSignedInUser(app, email);
      await app.services.auth.api.requestEmailChangeEmailOTP({
        headers: session,
        body: { newEmail: "nowhere@example.com" },
      });
      await expect(
        app.services.auth.api.changeEmailEmailOTP({
          headers: session,
          body: { newEmail: "nowhere@example.com", otp: "000000" },
        }),
      ).rejects.toMatchObject({ body: { code: "INVALID_OTP" } });
      await app.services.background.drain();
      await app.services.jobs.drain(["auth.deliver-email"], 5000);
      expect(app.outbox.some((m) => m.to === email && m.subject.includes("Security notice"))).toBe(
        false,
      );
    });
  });
});
