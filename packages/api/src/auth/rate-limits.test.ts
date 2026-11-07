import { CLIENT_IP_HEADER } from "@workspace/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createSignedInUser, createTestApp, type TestApp } from "../platform/testing/harness";

describe("rate limits", () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => app.close());

  type AuthBody = { email: string; password?: string };
  const post = (path: string, ip: string, body: AuthBody) =>
    app.services.auth.handler(
      new Request(`http://localhost:3001/api/auth${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", [CLIENT_IP_HEADER]: ip },
        body: JSON.stringify(body),
      }),
    );

  it("limits sign-in attempts per client IP, tighter than the global limit", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      statuses.push(
        (
          await post("/sign-in/email", "198.51.100.1", {
            email: "a@example.com",
            password: "wrong-password-1",
          })
        ).status,
      );
    }
    expect(statuses.slice(0, 10).every((status) => status !== 429)).toBe(true);
    expect(statuses.slice(10)).toEqual([429, 429]);
    // Another client is unaffected.
    expect(
      (
        await post("/sign-in/email", "198.51.100.2", {
          email: "a@example.com",
          password: "wrong-password-1",
        })
      ).status,
    ).not.toBe(429);
  });

  it("limits the email-sending endpoints much harder", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) {
      statuses.push(
        (await post("/request-password-reset", "198.51.100.3", { email: "a@example.com" })).status,
      );
    }
    expect(statuses).toEqual([200, 200, 200, 429, 429]);
  });

  it("limits a procedure per user, and counts each user separately", async () => {
    const a = app.client(await createSignedInUser(app, "limit-a@example.com"));
    const b = app.client(await createSignedInUser(app, "limit-b@example.com"));
    for (let i = 0; i < 60; i++)
      await a.preferences.update({ ui: { sidebarCollapsed: i % 2 === 0 } });
    await expect(a.preferences.update({ locale: "de" })).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    });
    await expect(b.preferences.update({ locale: "de" })).resolves.toMatchObject({ locale: "de" });
    // Reading is not limited.
    await expect(a.preferences.get()).resolves.toBeDefined();
  });
});
