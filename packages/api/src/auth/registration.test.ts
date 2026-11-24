import { uuidv7 } from "@workspace/db/columns";
import { user } from "@workspace/db/schema/auth";
import { SEND_CODE_PER_EMAIL } from "@workspace/auth";
import { afterAll, describe, expect, it } from "vitest";

import { createSignedInUser, createTestApp, type TestApp } from "../platform/testing/harness";

/** Asking for a sign-in code is where registration, disposable and rate-limit rules apply. */
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

  it("refuses unknown addresses when registration is closed", async () => {
    const app = await create({ config: { registrationOpen: false } });
    await expect(requestCode(app, "stranger@example.com")).rejects.toMatchObject({
      statusCode: 403,
      body: { code: "REGISTRATION_CLOSED" },
    });
    await expect(app.client().auth.registrationStatus()).resolves.toEqual({
      open: false,
      mode: "invite",
      providers: { google: false, github: false },
    });
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

  describe("abuse protections (no CAPTCHA, ADR 0056)", () => {
    it("sends a code with no challenge token, native clients included", async () => {
      const app = await create();
      const native = new Headers({ "user-agent": "okhttp/4", "expo-origin": "sigil://" });
      await expect(requestCode(app, "native@example.com", native)).resolves.toEqual({
        success: true,
      });
    });

    it("limits how often one address can be sent a code, in any letter case", async () => {
      const app = await create();
      for (let index = 0; index < SEND_CODE_PER_EMAIL.max; index += 1) {
        await requestCode(app, "flooded@example.com");
      }
      await expect(requestCode(app, "Flooded@Example.com")).rejects.toMatchObject({
        statusCode: 429,
      });
      await expect(requestCode(app, "someone-else@example.com")).resolves.toBeDefined();
    });
  });
});
