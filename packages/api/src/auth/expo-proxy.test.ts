import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestApp, type TestApp } from "../platform/testing/harness";

describe("Expo authorization proxy security", () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await createTestApp({
      config: { google: { clientId: "test-google-client", clientSecret: "test-google-secret" } },
    });
  });
  afterAll(async () => app.close());

  const proxyPath = (authorizationURL: string) =>
    `/api/auth/expo-authorization-proxy?${new URLSearchParams({ authorizationURL })}`;

  it("does not redirect to an arbitrary external authorization origin", async () => {
    const response = await app.app.request(
      proxyPath("https://untrusted.example/authorize?state=caller-controlled"),
    );
    expect(response.status).toBe(400);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.getSetCookie()).toEqual([]);
  });

  it("does not sign caller-supplied state even for a configured provider", async () => {
    // Regression for GHSA-4wq4-2ppv-q3hg: a trusted provider origin does not
    // establish that this state was issued by our server.
    const authorizationURL = "https://accounts.google.com/o/oauth2/v2/auth?state=caller-controlled";
    const response = await app.app.request(proxyPath(authorizationURL));
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(authorizationURL);
    expect(response.headers.getSetCookie()).toEqual([]);
  });
});
