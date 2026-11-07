import { afterAll, describe, expect, it } from "vitest";

import { PASSWORD, createTestApp, type TestApp } from "../testing/harness";

const apps: TestApp[] = [];
afterAll(async () => {
  await Promise.all(apps.map((app) => app.close()));
});

describe("jobs", () => {
  it("retries a failing email until the provider recovers, without losing or duplicating it", async () => {
    const failEmails = { remaining: 2 };
    const app = await createTestApp({ failEmails });
    apps.push(app);

    await app.services.auth.api.signUpEmail({
      body: { email: "retry@example.com", password: PASSWORD, name: "R" },
    });
    const mail = await app.waitForEmail((m) => m.to === "retry@example.com", 20_000);

    expect(mail.subject).toContain("Verify");
    expect(failEmails.remaining).toBe(0);
    expect(app.outbox.filter((m) => m.to === "retry@example.com")).toHaveLength(1);
  });

  it("queues emails off the request path: sign-up answers before the provider is involved", async () => {
    const failEmails = { remaining: 1_000 };
    const app = await createTestApp({ failEmails });
    apps.push(app);
    const response = await app.services.auth.api.signUpEmail({
      body: { email: "slow-provider@example.com", password: PASSWORD, name: "S" },
    });
    expect(response.user.email).toBe("slow-provider@example.com");
    expect(app.outbox).toHaveLength(0);
  });

  it("drains queued emails on shutdown", async () => {
    const app = await createTestApp();
    apps.push(app);
    await app.services.auth.api.signUpEmail({
      body: { email: "drain@example.com", password: PASSWORD, name: "D" },
    });
    expect((await app.services.stop(5_000)).drained).toBe(true);
    expect(
      app.outbox.some((mail) => mail.to === "drain@example.com" && mail.subject.includes("Verify")),
    ).toBe(true);
  });
});
