import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createSignedInUser,
  createTestApp,
  requestSignInCode,
  type TestApp,
} from "../platform/testing/harness";

describe("account enumeration", () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => app.close());

  const send = (email: string) =>
    app.services.auth.api.sendVerificationOTP({
      body: { email, type: "sign-in" },
      asResponse: true,
    });

  it("answers a code request for an existing email exactly like one for a new email", async () => {
    await createSignedInUser(app, "taken@example.com");
    const existing = await send("taken@example.com");
    const fresh = await send("fresh@example.com");

    expect(existing.status).toBe(fresh.status);
    expect(await existing.json()).toEqual(await fresh.json());
    expect(existing.headers.getSetCookie()).toEqual([]);
    expect(fresh.headers.getSetCookie()).toEqual([]);
    // Both addresses get a code, so the mailbox is the only place the difference could show.
    for (const to of ["taken@example.com", "fresh@example.com"]) {
      await app.waitForEmail((m) => m.to === to && /^\d{6} /.test(m.subject) && m.text.length > 0);
    }
  });

  it("creates no account until a code is redeemed", async () => {
    await send("not-yet@example.com");
    expect(await app.rows(sql`select 1 from "user" where email = 'not-yet@example.com'`)).toEqual(
      [],
    );
  });

  it("refuses a wrong code the same way for known and unknown emails", async () => {
    await createSignedInUser(app, "known@example.com");
    await requestSignInCode(app, "known@example.com");
    await requestSignInCode(app, "unknown@example.com");
    const attempt = (email: string) =>
      app.services.auth.api
        .signInEmailOTP({ body: { email, otp: "000000" } })
        .catch((error: { statusCode: number; body: { code: string } }) => ({
          status: error.statusCode,
          code: error.body.code,
        }));
    expect(await attempt("known@example.com")).toEqual(await attempt("unknown@example.com"));
  });

  it("does not offer passwords or the unused code flows", async () => {
    const post = (
      path: string,
      body: { email: string; otp?: string; password?: string; name?: string; type?: string },
    ) =>
      app.services.auth.handler(
        new Request(`http://localhost:3000/api/auth${path}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
      );
    const credentials = { email: "taken@example.com", password: "correct-horse-battery" };
    expect((await post("/sign-in/email", credentials)).ok).toBe(false);
    expect((await post("/sign-up/email", { ...credentials, name: "X" })).ok).toBe(false);
    expect((await post("/request-password-reset", { email: credentials.email })).ok).toBe(false);
    for (const path of [
      "/email-otp/verify-email",
      "/email-otp/request-password-reset",
      "/email-otp/reset-password",
      "/forget-password/email-otp",
    ]) {
      expect((await post(path, { email: credentials.email, otp: "123456" })).status).toBe(404);
    }
    const other = await post("/email-otp/send-verification-otp", {
      email: credentials.email,
      type: "forget-password",
    });
    expect(other.status).toBe(400);
  });
});
