import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { APIError } from "better-auth/api";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createSignedInUser, createTestApp, type TestApp } from "../testing/harness";
import { toOrpcError } from "./base";

describe("Better Auth error mapping", () => {
  const code = (
    status: ConstructorParameters<typeof APIError>[0],
    body?: { code?: string; message?: string },
  ) => {
    const mapped = toOrpcError(new APIError(status, body));
    return mapped instanceof ORPCError ? mapped : null;
  };

  it.each([
    ["BAD_REQUEST", "BAD_REQUEST"],
    ["FORBIDDEN", "FORBIDDEN"],
    ["NOT_FOUND", "NOT_FOUND"],
    ["CONFLICT", "CONFLICT"],
    ["TOO_MANY_REQUESTS", "TOO_MANY_REQUESTS"],
    ["UNPROCESSABLE_ENTITY", "BAD_REQUEST"],
    ["BAD_GATEWAY", "BAD_GATEWAY"],
  ] as const)("maps %s to %s", (status, expected) => {
    expect(code(status)?.code).toBe(expected);
  });

  it("reports a 401 after authentication as FORBIDDEN, so clients do not sign the user out", () => {
    expect(code("UNAUTHORIZED")?.code).toBe("FORBIDDEN");
  });

  it("keeps Better Auth's own code in data", () => {
    const mapped = code("FORBIDDEN", { code: "REGISTRATION_CLOSED", message: "closed" });
    expect(mapped?.data).toEqual({ code: "REGISTRATION_CLOSED" });
    expect(mapped?.message).toBe("closed");
  });

  it("leaves statuses without a code alone", () => {
    expect(toOrpcError(new APIError("INTERNAL_SERVER_ERROR"))).toBeInstanceOf(APIError);
  });
});

describe("error responses over HTTP", () => {
  let app: TestApp;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => app.close());

  type RpcBody = { json?: { locale: string } };
  const rpc = (path: string, headers: Record<string, string> = {}, body: RpcBody = {}) =>
    app.app.request(`/rpc/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    });

  it("answers 401 UNAUTHORIZED without a session", async () => {
    const response = await rpc("account/me");
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ json: { code: "UNAUTHORIZED" } });
  });

  it("answers 403 FORBIDDEN to a signed-in non-admin", async () => {
    const session = await createSignedInUser(app, "http-user@example.com");
    const response = await rpc("admin/access", { cookie: session.get("cookie") ?? "" });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ json: { code: "FORBIDDEN" } });
  });

  it("answers 400 BAD_REQUEST for invalid input", async () => {
    const session = await createSignedInUser(app, "http-input@example.com");
    const response = await rpc(
      "preferences/update",
      { cookie: session.get("cookie") ?? "" },
      { json: { locale: "xx" } },
    );
    expect(response.status).toBe(400);
  });

  it("serves a session end to end through the HTTP app", async () => {
    const session = await createSignedInUser(app, "http-ok@example.com");
    const response = await rpc("account/me", { cookie: session.get("cookie") ?? "" });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ json: { email: "http-ok@example.com" } });
  });

  it("serves the health check", async () => {
    const response = await app.app.request("/api/health");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("rejects a state-changing request from another origin", async () => {
    const response = await rpc("auth/registrationStatus", { origin: "https://evil.example" });
    expect(response.status).toBe(403);
    const auth = await app.app.request("/api/auth/sign-out", {
      method: "POST",
      headers: { origin: "https://evil.example" },
    });
    expect(auth.status).toBe(403);
  });

  it("accepts the app's own origin", async () => {
    const response = await rpc("auth/registrationStatus", { origin: "http://localhost:3001" });
    expect(response.status).toBe(200);
  });
});

describe("OpenAPI reference", () => {
  const documentSchema = z.object({
    info: z.object({ title: z.string(), version: z.string() }),
    servers: z.array(z.object({ url: z.string() })),
    tags: z.array(z.object({ name: z.string() })),
    paths: z.record(
      z.string(),
      z.record(
        z.string(),
        z.object({
          tags: z.array(z.string()).optional(),
          summary: z.string().optional(),
          security: z.array(z.object({}).loose()).optional(),
          servers: z.array(z.object({ url: z.string() })).optional(),
        }),
      ),
    ),
  });

  it("serves the spec when enabled and nothing when disabled", async () => {
    const on = await createTestApp({ config: { openApiReference: true } });
    const spec = await on.app.request("/api/reference/spec.json");
    expect(spec.status).toBe(200);
    const document = documentSchema.parse(await spec.json());
    expect(document.info.version).toBe("1.0.0");
    expect(document.servers).toEqual([expect.objectContaining({ url: "/api/reference" })]);
    expect(Object.keys(document.paths)).toContain("/preferences");
    // Better Auth's endpoints share the document, each served from /api/auth.
    expect(Object.keys(document.paths)).toContain("/sign-in/email");
    await on.close();

    const off = await createTestApp();
    expect((await off.app.request("/api/reference/spec.json")).status).toBe(404);
    await off.close();
  });

  it("tags, describes and secures every operation", async () => {
    const on = await createTestApp({ config: { openApiReference: true } });
    const document = documentSchema.parse(
      await (await on.app.request("/api/reference/spec.json")).json(),
    );
    await on.close();

    const known = new Set(document.tags.map((tag) => tag.name));
    for (const [path, operations] of Object.entries(document.paths)) {
      for (const [method, operation] of Object.entries(operations)) {
        const label = `${method.toUpperCase()} ${path}`;
        // Better Auth's own endpoints are documented by its generator.
        if (operation.servers?.[0]?.url === "/api/auth") continue;
        expect(operation.summary, label).toBeTruthy();
        expect(operation.tags?.length, label).toBe(1);
        expect(known.has(operation.tags?.[0] ?? ""), label).toBe(true);
      }
    }
    // Public procedures carry no security requirement; signed-in ones name the session cookie.
    expect(document.paths["/auth/registration-status"]?.get?.security).toBeUndefined();
    expect(document.paths["/notes"]?.get?.security).toEqual([{ sessionCookie: [] }]);
    expect(document.paths["/admin/users"]?.get?.security).toEqual([{ sessionCookie: [] }]);
  });

  it("serves the documented routes over plain HTTP, coercing query strings", async () => {
    const on = await createTestApp({ config: { openApiReference: true } });
    const session = await createSignedInUser(on, "openapi@example.com");
    const cookie = session.get("cookie") ?? "";

    const created = await on.app.request("/api/reference/notes", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ title: "From REST" }),
    });
    expect(created.status).toBe(201);

    const listed = await on.app.request("/api/reference/notes", { headers: { cookie } });
    expect(listed.status).toBe(200);
    expect(await listed.json()).toEqual([expect.objectContaining({ title: "From REST" })]);

    // page and limit arrive as query strings; coercion must let them reach the admin check (403), not fail validation (400).
    const denied = await on.app.request("/api/reference/admin/users?page=1&limit=5", {
      headers: { cookie },
    });
    expect(denied.status).toBe(403);
    await on.close();
  });
});
