import { getOpenAPIMeta } from "@orpc/openapi";
import { call, Procedure, type AnyProcedure, type AnyRouter } from "@orpc/server";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { appRouter } from "../platform/orpc/router";
import { createFullAdmin, fakeNetwork } from "../platform/testing/admin";
import {
  createSignedInUser,
  createTestApp,
  signIn,
  type TestApp,
} from "../platform/testing/harness";

/**
 * Seam 1: every procedure under `admin` is enumerated from the router, so a new one is covered
 * without anyone adding a case. Only a full admin (allow-listed, enrolled, past the step) gets
 * through; each write leaves exactly one audit row.
 */

type Entry = { path: string[]; procedure: AnyProcedure };

function procedures(node: AnyRouter, path: string[] = []): Entry[] {
  if (node instanceof Procedure) return [{ path, procedure: node }];
  return Object.entries(node).flatMap(([key, child]) =>
    procedures(child as AnyRouter, [...path, key]),
  );
}

const ADMIN = "owner@example.com";
const FORMER = "former@example.com";
const UPLOADED = "exercises/admin/new-thumbnail-abc.jpg";

/** Only these answer to an admin who has not passed the second step (they set it up). */
const ENROLMENT = new Set(["enrolment.status"]);

type Context = {
  targetUserId: string;
  targetEmail: string;
  exerciseId: string;
  requestedId: string;
  invitedId: string;
  revocableId: string;
};

type Input = { [key: string]: Input } | string | number | boolean | null | Input[] | undefined;

/** A valid input per procedure. A procedure without one fails the test: give it one here. */
const INPUTS: Record<string, (ctx: Context) => Input> = {
  "enrolment.status": () => undefined,
  overview: () => undefined,
  "audit.list": () => ({}),
  "users.list": () => ({ search: "target" }),
  "users.get": (ctx) => ({ userId: ctx.targetUserId }),
  "users.ban": (ctx) => ({ userId: ctx.targetUserId, reason: "spam" }),
  "users.unban": (ctx) => ({ userId: ctx.targetUserId }),
  "users.revokeSessions": (ctx) => ({ userId: ctx.targetUserId }),
  "users.delete": (ctx) => ({ userId: ctx.targetUserId, email: ctx.targetEmail }),
  "catalog.list": () => ({ search: "press" }),
  "catalog.get": (ctx) => ({ id: ctx.exerciseId }),
  "catalog.create": () => ({
    exercise: {
      title: "Matrix Press (Cable)",
      primaryMuscle: "chest",
      secondaryMuscles: [],
      equipment: "machine",
      exerciseType: "weight_reps",
      isFullBodyweight: false,
      aka: null,
      searchTerms: null,
      instructions: null,
      rank: 0,
    },
    thumbnailKey: UPLOADED,
  }),
  "catalog.update": (ctx) => ({ id: ctx.exerciseId, patch: { rank: 7 } }),
  "catalog.retire": (ctx) => ({ id: ctx.exerciseId }),
  "catalog.restore": (ctx) => ({ id: ctx.exerciseId }),
  "catalog.export": () => undefined,
  "catalog.mediaUploadUrl": () => ({
    slot: "thumbnail",
    contentType: "image/jpeg",
    contentLength: 1000,
  }),
  "access.list": () => ({}),
  "access.approve": (ctx) => ({ id: ctx.requestedId }),
  "access.invite": () => ({ email: "direct@example.com" }),
  "access.resend": (ctx) => ({ id: ctx.invitedId }),
  "access.revoke": (ctx) => ({ id: ctx.revocableId }),
  "releases.get": () => undefined,
  "releases.setMinimum": () => ({ version: "1.0.0" }),
};

let app: TestApp;
let headers: Record<"user" | "unenrolled" | "removed" | "admin", Headers>;
let adminId: string;
let ctx: Context;

/** Calls one procedure in-process as the router client would, with these request headers. */
function invoke(entry: Entry, input: Input, who?: Headers) {
  return call(entry.procedure, input, {
    context: { headers: who ?? new Headers(), services: app.services },
  });
}

async function idOf(query: ReturnType<typeof sql>) {
  const [row] = await app.rows(query);
  return String(row?.id);
}

beforeAll(async () => {
  const network = fakeNetwork({
    objects: new Set([UPLOADED]),
    release: { tag: "v1.0.0", publishedAt: "2026-11-16T00:00:00Z" },
  });
  app = await createTestApp({
    config: { adminEmails: [ADMIN, FORMER, "pending@example.com"] },
    fetch: network.fetch,
  });
  const admin = await createFullAdmin(app, ADMIN);
  const former = await createFullAdmin(app, FORMER);
  const unenrolled = await signIn(app, "pending@example.com", { name: "Pending" });
  headers = {
    user: await createSignedInUser(app, "plain@example.com"),
    unenrolled,
    removed: former.headers,
    admin: admin.headers,
  };
  // The address leaves ADMIN_EMAILS after it became an admin.
  app.services.config.adminEmails.splice(app.services.config.adminEmails.indexOf(FORMER), 1);
  adminId = await idOf(sql`SELECT id FROM "user" WHERE email = ${ADMIN}`);

  const client = app.client(headers.admin);
  await createSignedInUser(app, "target@example.com", "Target");
  const created = await client.admin.catalog.create({
    exercise: {
      title: "Setup Row (Cable)",
      primaryMuscle: "upper_back",
      secondaryMuscles: [],
      equipment: "machine",
      exerciseType: "weight_reps",
      isFullBodyweight: false,
      aka: null,
      searchTerms: "press",
      instructions: null,
      rank: 0,
    },
    thumbnailKey: UPLOADED,
  });
  const anon = app.client();
  for (const email of ["asks@example.com", "invited@example.com", "revocable@example.com"]) {
    await anon.access.request({ email });
  }
  const invited = await idOf(sql`SELECT id FROM access_invite WHERE email = 'invited@example.com'`);
  await client.admin.access.approve({ id: invited });
  ctx = {
    targetUserId: await idOf(sql`SELECT id FROM "user" WHERE email = 'target@example.com'`),
    targetEmail: "target@example.com",
    exerciseId: created.id,
    requestedId: await idOf(sql`SELECT id FROM access_invite WHERE email = 'asks@example.com'`),
    invitedId: invited,
    revocableId: await idOf(
      sql`SELECT id FROM access_invite WHERE email = 'revocable@example.com'`,
    ),
  };
}, 120_000);

afterAll(async () => {
  await app?.close();
});

const all = procedures(appRouter.admin);
const guarded = all.filter((entry) => !ENROLMENT.has(entry.path.join(".")));

async function failure(pending: ReturnType<typeof invoke>) {
  try {
    await pending;
  } catch (error) {
    return error;
  }
  throw new Error("Expected the call to fail");
}

describe("admin authorization", () => {
  it("has an input for every admin procedure", () => {
    expect(all.map((entry) => entry.path.join(".")).filter((path) => !(path in INPUTS))).toEqual(
      [],
    );
  });

  it.each(guarded.map((entry) => [entry.path.join("."), entry] as const))(
    "admin.%s refuses everyone but a full admin",
    async (name, entry) => {
      const input = INPUTS[name]?.(ctx);
      const as = (who?: keyof typeof headers) => invoke(entry, input, who && headers[who]);
      expect(await failure(as())).toMatchObject({ code: "UNAUTHORIZED" });
      expect(await failure(as("user"))).toMatchObject({ code: "NOT_FOUND" });
      expect(await failure(as("removed"))).toMatchObject({ code: "NOT_FOUND" });
      expect(await failure(as("unenrolled"))).toMatchObject({
        code: "FORBIDDEN",
        data: { code: "TWO_FACTOR_REQUIRED", enrolled: false },
      });

      const count = async () =>
        Number((await app.rows(sql`SELECT count(*)::int AS n FROM admin_audit`))[0]?.n);
      const before = await count();
      await invoke(entry, input, headers.admin);
      const method = getOpenAPIMeta(entry.procedure)?.method ?? "POST";
      const isWrite = method !== "GET";
      expect(await count()).toBe(before + (isWrite ? 1 : 0));
      if (isWrite) {
        const [last] = await app.rows(
          sql`SELECT actor_user_id, action FROM admin_audit ORDER BY created_at DESC, id DESC LIMIT 1`,
        );
        expect(last?.actor_user_id).toBe(adminId);
      }
    },
  );

  it("lets an allow-listed admin read the enrolment status before the second step", async () => {
    const status = await app.client(headers.unenrolled).admin.enrolment.status();
    expect(status).toMatchObject({ twoFactorEnabled: false, sessionVerified: false });
    expect(await failure(app.client(headers.user).admin.enrolment.status())).toMatchObject({
      code: "NOT_FOUND",
    });
    expect(await app.client(headers.admin).admin.enrolment.status()).toMatchObject({
      twoFactorEnabled: true,
      sessionVerified: true,
    });
  });

  it("closes the two-factor endpoints to everyone else, and the disable endpoint to all", async () => {
    const asUser = app.services.auth.api.enableTwoFactor({ headers: headers.user, body: {} });
    await expect(asUser).rejects.toMatchObject({ statusCode: 404 });
    const disable = app.services.auth.api.disableTwoFactor({ headers: headers.admin, body: {} });
    await expect(disable).rejects.toMatchObject({ statusCode: 404 });
  });
});
