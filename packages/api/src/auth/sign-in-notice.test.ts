import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { CLIENT_IP_HEADER } from "@workspace/shared";

import {
  cookieFrom,
  createSignedInUser,
  createTestApp,
  PASSWORD,
  type TestApp,
} from "../platform/testing/harness";

describe("sign-in notices", () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => app.close());
  afterEach(() => vi.unstubAllGlobals());

  it("queues exactly one notice after a successful provider callback", async () => {
    const oauth = await createTestApp({
      config: { github: { clientId: "test-client", clientSecret: "test-secret" } },
    });
    const email = "provider-notice@example.com";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: Parameters<typeof fetch>[0]) => {
        const url = input instanceof Request ? input.url : String(input);
        if (url === "https://github.com/login/oauth/access_token")
          return Response.json({
            access_token: "provider-access-token",
            token_type: "bearer",
            scope: "user:email",
          });
        if (url === "https://api.github.com/user")
          return Response.json({
            id: 123,
            login: "provider-user",
            name: "Provider User",
            email,
            avatar_url: null,
          });
        if (url === "https://api.github.com/user/emails")
          return Response.json([{ email, primary: true, verified: true }]);
        throw new Error(`Unexpected network boundary: ${new URL(url).origin}`);
      }),
    );
    try {
      const start = await oauth.services.auth.api.signInSocial({
        body: { provider: "github", callbackURL: "/app", disableRedirect: true },
        asResponse: true,
      });
      const authorize = z.object({ url: z.url() }).parse(await start.json());
      const state = new URL(authorize.url).searchParams.get("state");
      expect(state).toBeTruthy();
      const callback = await oauth.services.auth.handler(
        new Request(
          `http://localhost:3001/api/auth/callback/github?code=test-code&state=${encodeURIComponent(state!)}`,
          { headers: { cookie: cookieFrom(start), [CLIENT_IP_HEADER]: "203.0.113.43" } },
        ),
      );
      expect(callback.status).toBe(302);
      expect(callback.headers.get("location")).toBe("/app");
      const notice = await oauth.waitForEmail(
        (mail) => mail.to === email && mail.subject.includes("New sign-in"),
      );
      expect(notice.text).toContain("203.0.113.43");
      await oauth.services.background.drain();
      await oauth.services.jobs.drain(["auth.deliver-email"], 5000);
      expect(oauth.outbox.filter((mail) => mail.subject.includes("New sign-in"))).toHaveLength(1);
    } finally {
      await oauth.close();
    }
  });

  it("queues a localized successful sign-in notice with request context, not a failed-login notice", async () => {
    const email = "login-notice@example.com";
    const session = await createSignedInUser(app, email);
    await app.client(session).preferences.update({ locale: "de" });
    // Drain earlier verification/sign-in work before checking this distinct request.
    await app.services.background.drain();
    await app.services.jobs.drain(["auth.deliver-email"], 5000);
    app.outbox.length = 0;
    const headers = new Headers({
      [CLIENT_IP_HEADER]: "203.0.113.42",
      "user-agent": "Mozilla/5.0 (X11; Linux x86_64) Chrome/130.0.0.0",
    });
    const response = await app.services.auth.handler(
      new Request("http://localhost:3001/api/auth/sign-in/email", {
        method: "POST",
        headers: { ...Object.fromEntries(headers), "content-type": "application/json" },
        body: JSON.stringify({ email, password: PASSWORD }),
      }),
    );
    expect(response.ok).toBe(true);
    const notice = await app.waitForEmail(
      (mail) => mail.to === email && mail.subject.includes("Neue Anmeldung"),
    );
    expect(notice.text).toContain("203.0.113.42");
    expect(notice.text).toContain("Chrome");
    await expect(
      app.services.auth.api.signInEmail({ body: { email, password: "wrong-password-123" } }),
    ).rejects.toThrow();
    await app.services.background.drain();
    await app.services.jobs.drain(["auth.deliver-email"], 5000);
    expect(app.outbox.filter((mail) => mail.subject.includes("Neue Anmeldung"))).toHaveLength(1);
  });
});
