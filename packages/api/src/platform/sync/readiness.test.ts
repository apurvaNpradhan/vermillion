import { afterAll, describe, expect, it } from "vitest";

import { createTestApp, type TestApp } from "../testing/harness";

const apps: TestApp[] = [];
afterAll(async () => {
  await Promise.all(apps.map((app) => app.close()));
});

describe("health probes", () => {
  it("keeps liveness separate from readiness, and treats a missing slot as ready", async () => {
    const app = await createTestApp();
    apps.push(app);

    const live = await app.app.request("/api/health");
    expect(live.status).toBe(200);
    expect(await live.json()).toEqual({ status: "ok" });

    const ready = await app.app.request("/api/ready");
    const body = await ready.json();
    expect(ready.status).toBe(200);
    expect(body).toEqual({ status: "ok", replication: { status: "absent", slots: [] } });
  });
});
