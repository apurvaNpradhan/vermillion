import { afterEach, describe, expect, it, vi } from "vitest";

import { createFullAdmin, fakeNetwork } from "../platform/testing/admin";
import { createTestApp, type TestApp } from "../platform/testing/harness";

const ADMIN = "owner@example.com";

let app: TestApp | undefined;
afterEach(async () => {
  vi.useRealTimers();
  await app?.close();
  app = undefined;
});

describe("release status", () => {
  it("reports the minimum the admin set and validates it as a version", async () => {
    const network = fakeNetwork({ release: null });
    app = await createTestApp({ config: { adminEmails: [ADMIN] }, fetch: network.fetch });
    const admin = app.client((await createFullAdmin(app, ADMIN)).headers);
    await expect(app.client().release.status()).resolves.toEqual({
      minimumVersion: null,
      latest: null,
    });
    for (const version of ["1.2", "v1.2.0", "latest"]) {
      await expect(admin.admin.releases.setMinimum({ version })).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    }
    await admin.admin.releases.setMinimum({ version: "1.1.0" });
    await expect(app.client().release.status()).resolves.toMatchObject({ minimumVersion: "1.1.0" });
  });

  it("reads the latest GitHub release, caches it and keeps it when GitHub fails", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-17T10:00:00Z"));
    const options: Parameters<typeof fakeNetwork>[0] = {
      release: { tag: "v1.3.0", publishedAt: "2026-11-16T09:00:00Z" },
    };
    const network = fakeNetwork(options);
    app = await createTestApp({ fetch: network.fetch });
    const latest = {
      version: "1.3.0",
      url: "https://github.com/example/patina/releases/download/v1.3.0/app.apk",
      publishedAt: "2026-11-16T09:00:00Z",
    };
    await expect(app.client().release.status()).resolves.toEqual({ minimumVersion: null, latest });
    await app.client().release.status();
    expect(network.calls.github).toBe(1);

    options.release = "fail";
    vi.setSystemTime(new Date("2026-11-17T10:11:00Z"));
    await expect(app.client().release.status()).resolves.toMatchObject({ latest });
    expect(network.calls.github).toBe(2);

    options.release = { tag: "v1.4.0", publishedAt: "2026-11-17T10:00:00Z" };
    vi.setSystemTime(new Date("2026-11-17T10:13:00Z"));
    await expect(app.client().release.status()).resolves.toMatchObject({
      latest: { version: "1.4.0" },
    });
  });
});
