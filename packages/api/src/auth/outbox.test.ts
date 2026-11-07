import { sql } from "drizzle-orm";
import { authEmailOutbox } from "./tables";
import { afterAll, expect, it } from "vitest";
import { authEmailSchema } from "@workspace/auth";

import { defineQueue } from "../platform/jobs";
import { resumeEmailOutbox } from "./index";
import { createSignedInUser, createTestApp, type TestApp } from "../platform/testing/harness";

const apps: TestApp[] = [];
afterAll(async () => {
  await Promise.all(apps.map((app) => app.close()));
});

it("does not report a successful shutdown drain when persistence succeeded but enqueue did not", async () => {
  const app = await createTestApp();
  apps.push(app);
  const session = await createSignedInUser(app, "unqueued@example.com");
  const { id: userId } = await app.client(session).account.me();
  await app.services.background.drain();
  expect(await app.services.jobs.drain(["auth.deliver-email"], 5000)).toBe(true);
  expect(await app.rows(sql`select id from auth_email_outbox`)).toEqual([]);
  // Fault-state fixture at the persisted-insert / failed-enqueue boundary; no own modules are mocked.
  await app.services.db.insert(authEmailOutbox).values({
    userId,
    expiresAt: new Date(Date.now() + 60_000),
    payload: {
      kind: "reset-password",
      userId,
      url: "https://example.com/reset?token=unqueued",
      request: { localeHint: "en", requestedAt: new Date().toISOString() },
    },
  });
  expect((await app.services.stop(500)).drained).toBe(false);
  expect(
    await app.rows(sql`select id from auth_email_outbox where user_id = ${userId}`),
  ).toHaveLength(1);
});

it("recovers legacy queued content once, scrubs retained payloads and removes delivered outbox content", async () => {
  const app = await createTestApp();
  apps.push(app);
  const email = "legacy@example.com";
  const session = await createSignedInUser(app, email);
  const { id: userId } = await app.client(session).account.me();
  await app.services.background.drain();
  await app.services.jobs.drain(["auth.deliver-email"], 5000);
  app.outbox.length = 0;
  // Deployment fixture: pg-boss content-format jobs from the previous version, not a mocked queue.
  const legacy = defineQueue({
    name: "auth.send-email",
    schema: authEmailSchema,
    handler: async () => undefined,
  });
  await app.services.jobs.enqueue(legacy, {
    kind: "reset-password",
    userId,
    url: "https://example.com/reset?token=legacy-private",
    request: { localeHint: "en", requestedAt: new Date().toISOString(), ip: "203.0.113.88" },
  });
  await resumeEmailOutbox(app.services);
  await resumeEmailOutbox(app.services);
  expect(await app.services.jobs.drain(["auth.deliver-email"], 5000)).toBe(true);
  expect(app.outbox.filter((mail) => mail.subject.includes("Reset"))).toHaveLength(1);
  const retained = JSON.stringify(
    await app.rows(sql`select data::text as payload from pgboss.job`),
  );
  expect(retained).not.toContain("legacy-private");
  expect(retained).not.toContain("203.0.113.88");
  expect(await app.rows(sql`select id from auth_email_outbox where user_id = ${userId}`)).toEqual(
    [],
  );
});
