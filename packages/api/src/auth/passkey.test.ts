import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { createSignedInUser, createTestApp, type TestApp } from "../platform/testing/harness";

const optionsSchema = z.object({
  challenge: z.string().min(1),
  rpId: z.string().optional(),
  rp: z.object({ id: z.string(), name: z.string() }).optional(),
});

describe("passkeys", () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await createTestApp({
      config: {
        appName: "Acme",
        passkey: {
          rpId: "dev.example.com",
          origins: ["https://dev.example.com", "android:apk-key-hash:abc"],
        },
      },
    });
  });
  afterAll(async () => app.close());

  it("refuses registration options without a session", async () => {
    const response = await app.app.request("/api/auth/passkey/generate-register-options");
    expect(response.status).toBe(401);
  });

  it("issues registration options for the configured relying party to a signed-in user", async () => {
    const headers = await createSignedInUser(app, "pk@example.com");
    const response = await app.app.request("/api/auth/passkey/generate-register-options", {
      headers,
    });
    expect(response.status).toBe(200);
    const options = optionsSchema.parse(await response.json());
    expect(options.rp).toEqual({ id: "dev.example.com", name: "Acme" });
    // The challenge is kept in a signed cookie the verify call must send back.
    expect(response.headers.getSetCookie().join(";")).toContain("better-auth-passkey");
  });

  it("issues authentication options without a session", async () => {
    const response = await app.app.request("/api/auth/passkey/generate-authenticate-options");
    expect(response.status).toBe(200);
    expect(optionsSchema.parse(await response.json()).rpId).toBe("dev.example.com");
  });

  it("rejects a verification without a challenge", async () => {
    const response = await app.app.request("/api/auth/passkey/verify-authentication", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ response: {} }),
    });
    expect(response.status).toBe(400);
  });

  it("trusts a browser origin from the passkey list but not an unlisted one", async () => {
    const post = (origin: string) =>
      app.app.request("/api/auth/passkey/verify-authentication", {
        method: "POST",
        headers: { "content-type": "application/json", origin },
        body: JSON.stringify({ response: {} }),
      });
    expect((await post("https://dev.example.com")).status).toBe(400);
    expect((await post("https://evil.example")).status).toBe(403);
  });
});
