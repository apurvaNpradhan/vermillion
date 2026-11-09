import { sql } from "drizzle-orm";
import { authEmailOutbox } from "./tables";
import { afterAll, expect, it } from "vitest";
import { authEmailSchema } from "@workspace/auth";
import { OTP_EXPIRY_SECONDS } from "@workspace/shared";

import { defineQueue } from "../platform/jobs";
import { resumeEmailOutbox } from "./index";
import { createSignedInUser, createTestApp, type TestApp } from "../platform/testing/harness";

const apps: TestApp[] = [];
afterAll(async () => {
  await Promise.all(apps.map((app) => app.close()));
});

it.each(["sign-in-code", "change-email-code"] as const)(
  "expires %s at the code deadline and discards it after a delayed retry",
  async (kind) => {
    const app = await createTestApp();
    apps.push(app);
    const session =
      kind === "change-email-code"
        ? await createSignedInUser(app, "change-expiry@example.com")
        : undefined;
    await app.services.background.drain();
    await app.services.jobs.drain(["auth.deliver-email"], 5000);
    app.outbox.length = 0;
    let release = () => {};
    const outage = new Promise<void>((resolve) => {
      release = resolve;
    });
    let started = () => {};
    const sending = new Promise<void>((resolve) => {
      started = resolve;
    });
    // The provider recovers after the first attempt; an expired retry must not deliver anything.
    const deliver = app.services.emailTransport.send;
    let unavailable = true;
    app.services.emailTransport.send = async (email) => {
      if (!unavailable) return deliver(email);
      unavailable = false;
      started();
      await outage;
      throw new Error("provider unavailable");
    };
    try {
      if (session) {
        await app.services.auth.api.requestEmailChangeEmailOTP({
          headers: session,
          body: { newEmail: "new-expiry@example.com" },
        });
      } else {
        await app.services.auth.api.sendVerificationOTP({
          body: { email: "signin-expiry@example.com", type: "sign-in" },
        });
      }
      await sending;
      const rows = await app.rows(sql`
        select extract(epoch from (expires_at - (payload->'request'->>'requestedAt')::timestamptz))::int as lifetime
        from auth_email_outbox where payload->>'kind' = ${kind}
      `);
      expect(rows).toEqual([{ lifetime: OTP_EXPIRY_SECONDS }]);
      await app.rows(sql`update auth_email_outbox set expires_at = now() - interval '1 second'`);
    } finally {
      release();
    }
    expect(await app.services.jobs.drain(["auth.deliver-email"], 5000)).toBe(true);
    expect(app.outbox).toEqual([]);
    expect(await app.rows(sql`select id from auth_email_outbox`)).toEqual([]);
  },
);

it("discards previously queued codes whose verification deadline passed before their outbox expiry", async () => {
  const app = await createTestApp();
  apps.push(app);
  const session = await createSignedInUser(app, "stale-code@example.com");
  const { id: userId } = await app.client(session).account.me();
  await app.services.background.drain();
  await app.services.jobs.drain(["auth.deliver-email"], 5000);
  app.outbox.length = 0;
  for (const kind of ["sign-in-code", "change-email-code"] as const) {
    await app.services.db.insert(authEmailOutbox).values({
      userId,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      payload: {
        kind,
        userId,
        to: "stale-code@example.com",
        otp: "123456",
        request: {
          localeHint: "en",
          requestedAt: new Date(Date.now() - (OTP_EXPIRY_SECONDS + 60) * 1000).toISOString(),
        },
      },
    });
  }
  await resumeEmailOutbox(app.services);
  expect(await app.services.jobs.drain(["auth.deliver-email"], 5000)).toBe(true);
  expect(app.outbox).toEqual([]);
  expect(await app.rows(sql`select id from auth_email_outbox`)).toEqual([]);
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
      kind: "delete-account",
      userId,
      url: "https://example.com/delete?token=unqueued",
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
    kind: "delete-account",
    userId,
    url: "https://example.com/delete?token=legacy-private",
    request: { localeHint: "en", requestedAt: new Date().toISOString(), ip: "203.0.113.88" },
  });
  await resumeEmailOutbox(app.services);
  await resumeEmailOutbox(app.services);
  expect(await app.services.jobs.drain(["auth.deliver-email"], 5000)).toBe(true);
  expect(app.outbox.filter((mail) => mail.subject.includes("deleting"))).toHaveLength(1);
  const retained = JSON.stringify(
    await app.rows(sql`select data::text as payload from pgboss.job`),
  );
  expect(retained).not.toContain("legacy-private");
  expect(retained).not.toContain("203.0.113.88");
  expect(await app.rows(sql`select id from auth_email_outbox where user_id = ${userId}`)).toEqual(
    [],
  );
});
