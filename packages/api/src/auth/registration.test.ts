import { afterAll, describe, expect, it, vi } from "vitest";

import {
  createSignedInUser,
  createTestApp,
  PASSWORD,
  type TestApp,
} from "../platform/testing/harness";

const signUp = (app: TestApp, email: string, headers?: Headers) =>
  app.services.auth.api.signUpEmail({
    body: { email, password: PASSWORD, name: "Someone" },
    ...(headers ? { headers } : {}),
  });

const apps: TestApp[] = [];
const create = async (...args: Parameters<typeof createTestApp>) => {
  const app = await createTestApp(...args);
  apps.push(app);
  return app;
};
afterAll(async () => {
  await Promise.all(apps.map((app) => app.close()));
});

describe("registration policy", () => {
  it("accepts sign-ups while registration is open", async () => {
    const app = await create();
    await expect(signUp(app, "open@example.com")).resolves.toBeDefined();
  });

  it("refuses everyone but admin emails when registration is closed", async () => {
    const app = await create({
      config: { registrationOpen: false, adminEmails: ["owner@example.com"] },
    });
    await expect(signUp(app, "stranger@example.com")).rejects.toMatchObject({
      statusCode: 403,
      body: { code: "REGISTRATION_CLOSED" },
    });
    // The owner is never locked out of their own instance.
    await expect(signUp(app, "owner@example.com")).resolves.toBeDefined();
    const session = await createSignedInUser(app, "owner2@example.com").catch(() => null);
    expect(session).toBeNull();
    await expect(app.client().auth.registrationStatus()).resolves.toEqual({
      open: false,
      providers: { google: false, github: false },
    });
  });

  it("lets an admin email register, verify and sign in while closed", async () => {
    const app = await create({
      config: { registrationOpen: false, adminEmails: ["owner@example.com"] },
    });
    const session = await createSignedInUser(app, "owner@example.com");
    await expect(app.client(session).admin.access()).resolves.toEqual({ admin: true });
  });

  it.each(["x@mailinator.com", "x@sub.mailinator.com", "X@YOPMAIL.COM"])(
    "rejects the disposable address %s at sign-up",
    async (email) => {
      const app = await create();
      await expect(signUp(app, email)).rejects.toMatchObject({
        body: { code: "DISPOSABLE_EMAIL_NOT_ALLOWED" },
      });
    },
  );

  it("rejects an email change to a disposable address", async () => {
    const app = await create();
    const session = await createSignedInUser(app, "changer@example.com");
    await expect(
      app.services.auth.api.changeEmail({
        headers: session,
        body: { newEmail: "new@mailinator.com" },
      }),
    ).rejects.toMatchObject({ body: { code: "DISPOSABLE_EMAIL_NOT_ALLOWED" } });
  });

  describe("CAPTCHA", () => {
    type SiteverifyReply = { success: boolean; action: string; hostname: string };
    const answer = (payload: SiteverifyReply) =>
      vi.fn(async () => new Response(JSON.stringify(payload)));
    const good = { success: true, action: "auth", hostname: "localhost" };

    it("is not required when no secret is configured", async () => {
      const app = await create();
      await expect(signUp(app, "nocaptcha@example.com")).resolves.toBeDefined();
    });

    it("is required on sign-up, sign-in and password reset once a secret is configured", async () => {
      const fetch = answer(good);
      const app = await create({ config: { turnstileSecret: "secret" }, fetch });
      const token = new Headers({ "x-turnstile-token": "good-token" });
      await signUp(app, "captcha@example.com", token);

      const captchaFailed = { statusCode: 403, body: { code: "CAPTCHA_FAILED" } };
      await expect(signUp(app, "nobody@example.com")).rejects.toMatchObject(captchaFailed);
      await expect(
        app.services.auth.api.signInEmail({
          body: { email: "captcha@example.com", password: PASSWORD },
        }),
      ).rejects.toMatchObject(captchaFailed);
      await expect(
        app.services.auth.api.requestPasswordReset({ body: { email: "captcha@example.com" } }),
      ).rejects.toMatchObject(captchaFailed);
      await expect(
        app.services.auth.api.requestPasswordReset({
          body: { email: "captcha@example.com" },
          headers: token,
        }),
      ).resolves.toBeDefined();
    });

    it.each([
      { success: true, action: "other", hostname: "localhost" },
      { success: true, action: "auth", hostname: "evil.example" },
      { success: false, action: "auth", hostname: "localhost" },
    ])("rejects a token the provider does not vouch for: %j", async (payload) => {
      const app = await create({ config: { turnstileSecret: "secret" }, fetch: answer(payload) });
      await expect(
        signUp(app, "bad-token@example.com", new Headers({ "x-turnstile-token": "t" })),
      ).rejects.toMatchObject({ body: { code: "CAPTCHA_FAILED" } });
    });

    it("fails closed when the provider cannot be reached", async () => {
      const fetch = vi.fn(async () => {
        throw new Error("network down");
      });
      const app = await create({ config: { turnstileSecret: "secret" }, fetch });
      await expect(
        signUp(app, "down@example.com", new Headers({ "x-turnstile-token": "t" })),
      ).rejects.toMatchObject({ body: { code: "CAPTCHA_FAILED" } });
    });

    it("exempts no client: a native app without a token is refused too", async () => {
      const app = await create({ config: { turnstileSecret: "secret" }, fetch: answer(good) });
      const native = new Headers({ "user-agent": "okhttp/4", "expo-origin": "vermillion://" });
      await expect(signUp(app, "native@example.com", native)).rejects.toMatchObject({
        body: { code: "CAPTCHA_FAILED" },
      });
    });
  });
});
