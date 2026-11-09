import { uuidv7 } from "@workspace/db/columns";
import { user } from "@workspace/db/schema/auth";
import { afterAll, describe, expect, it, vi } from "vitest";

import { createSignedInUser, createTestApp, type TestApp } from "../platform/testing/harness";

/** Asking for a sign-in code is where registration, disposable and CAPTCHA rules apply. */
const requestCode = (app: TestApp, email: string, headers?: Headers) =>
  app.services.auth.api.sendVerificationOTP({
    body: { email, type: "sign-in" },
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
  it("sends a code to a new address while registration is open", async () => {
    const app = await create();
    await expect(requestCode(app, "open@example.com")).resolves.toEqual({ success: true });
  });

  it("refuses unknown addresses but admin emails and existing accounts when registration is closed", async () => {
    const app = await create({
      config: { registrationOpen: false, adminEmails: ["owner@example.com"] },
    });
    await expect(requestCode(app, "stranger@example.com")).rejects.toMatchObject({
      statusCode: 403,
      body: { code: "REGISTRATION_CLOSED" },
    });
    // The owner is never locked out of their own instance.
    await expect(requestCode(app, "owner@example.com")).resolves.toEqual({ success: true });
    await expect(app.client().auth.registrationStatus()).resolves.toEqual({
      open: false,
      providers: { google: false, github: false },
    });
  });

  it("lets an admin email sign in and get the role while closed", async () => {
    const app = await create({
      config: { registrationOpen: false, adminEmails: ["owner@example.com"] },
    });
    const session = await createSignedInUser(app, "owner@example.com");
    await expect(app.client(session).admin.access()).resolves.toEqual({ admin: true });
  });

  it("keeps existing accounts signing in after registration closes", async () => {
    const app = await create({ config: { registrationOpen: false } });
    await app.services.db
      .insert(user)
      .values({ id: uuidv7(), email: "member@example.com", name: "Member", emailVerified: true });
    await expect(requestCode(app, "member@example.com")).resolves.toEqual({ success: true });
  });

  it.each(["x@mailinator.com", "x@sub.mailinator.com", "X@YOPMAIL.COM"])(
    "rejects the disposable address %s before a code is sent",
    async (email) => {
      const app = await create();
      await expect(requestCode(app, email)).rejects.toMatchObject({
        body: { code: "DISPOSABLE_EMAIL_NOT_ALLOWED" },
      });
      expect(app.outbox).toHaveLength(0);
    },
  );

  it("rejects an email change to a disposable address", async () => {
    const app = await create();
    const session = await createSignedInUser(app, "changer@example.com");
    await expect(
      app.services.auth.api.requestEmailChangeEmailOTP({
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
      await expect(requestCode(app, "nocaptcha@example.com")).resolves.toBeDefined();
    });

    it("is required before a code is sent once a secret is configured", async () => {
      const fetch = answer(good);
      const app = await create({ config: { turnstileSecret: "secret" }, fetch });
      const token = new Headers({ "x-turnstile-token": "good-token" });
      await expect(requestCode(app, "captcha@example.com", token)).resolves.toBeDefined();
      await expect(requestCode(app, "nobody@example.com")).rejects.toMatchObject({
        statusCode: 403,
        body: { code: "CAPTCHA_FAILED" },
      });
      expect(app.outbox.some((m) => m.to === "nobody@example.com")).toBe(false);
    });

    it.each([
      { success: true, action: "other", hostname: "localhost" },
      { success: true, action: "auth", hostname: "evil.example" },
      { success: false, action: "auth", hostname: "localhost" },
    ])("rejects a token the provider does not vouch for: %j", async (payload) => {
      const app = await create({ config: { turnstileSecret: "secret" }, fetch: answer(payload) });
      await expect(
        requestCode(app, "bad-token@example.com", new Headers({ "x-turnstile-token": "t" })),
      ).rejects.toMatchObject({ body: { code: "CAPTCHA_FAILED" } });
    });

    it("fails closed when the provider cannot be reached", async () => {
      const fetch = vi.fn(async () => {
        throw new Error("network down");
      });
      const app = await create({ config: { turnstileSecret: "secret" }, fetch });
      await expect(
        requestCode(app, "down@example.com", new Headers({ "x-turnstile-token": "t" })),
      ).rejects.toMatchObject({ body: { code: "CAPTCHA_FAILED" } });
    });

    it("exempts no client: a native app without a token is refused too", async () => {
      const app = await create({ config: { turnstileSecret: "secret" }, fetch: answer(good) });
      const native = new Headers({ "user-agent": "okhttp/4", "expo-origin": "vermillion://" });
      await expect(requestCode(app, "native@example.com", native)).rejects.toMatchObject({
        body: { code: "CAPTCHA_FAILED" },
      });
    });
  });
});
