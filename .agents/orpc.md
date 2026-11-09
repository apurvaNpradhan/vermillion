# oRPC

oRPC 2 beta, versions pinned exactly (catalog in `pnpm-workspace.yaml`); Renovate updates them as a group.

## Builders

`platform/orpc/base.ts` defines typed error codes and two builders: `public` and `authed`. Always start from one of them. `authed` supplies `context.userId` and `context.services`.

Better Auth failures are mapped to our codes. A 401 from Better Auth after an authenticated check is reported as `FORBIDDEN` so the client does not sign the user out.

## Procedure shape

```ts
const create = authed
  .use(rateLimit({ name: "notes.create", windowMs: 60_000, max: 60 }))
  .input(z.object({ title, body }))
  .output(noteSchema)
  .handler(({ context, input }) => createNote(context.services.db, context.userId, input));
```

- Handlers are thin. Business logic is one operation per file under `operations/`.
- Declare `.output(...)`; ownership failures return `NOT_FOUND`, not `FORBIDDEN`, so ids do not leak.
- `rateLimit` is per user, fixed window, in process memory. Name each limited procedure uniquely. Endpoint-level limits on auth routes are separate and stricter.

## OpenAPI

Every procedure also has a REST route, served (with the reference UI at `/api/reference`, spec at `/api/reference/spec.json`) only when `openApiReference` is on. The native app keeps using RPC; the spec is for people and tools. Better Auth's own endpoints (`/api/auth/*`) are in the same document: its `openAPI` plugin is on only with `openApiReference`, its own Scalar page is disabled, and `generateOpenApiDocument` merges its schema, giving each operation a `/api/auth` server. Load the `orpc-openapi` skill before changing it.

- Give each procedure `openapi({ method, path, summary })` via `.meta(...)`; add `description` for anything non-obvious and `successStatus: 201` for creates. Path params (`{id}`) must also be fields in the input schema.
- Tag by vertical: define `const xApi = authed.meta(openapi({ tags: ["X"] }))` in the vertical's `procedures.ts` and build from it. A new tag also goes in `TAGS` in `platform/orpc/openapi.ts`.
- `authed` adds the session-cookie security requirement; `base` procedures are documented as public.
- Document shape (title, version, servers, security scheme, tags) lives in `platform/orpc/openapi.ts`. Query and path strings are coerced from the schemas by Smart Coercion (no procedure takes a numeric query string today, so that path has no test).
- Resource routes use REST verbs (`GET /notes/{id}`, `PATCH`, `DELETE`); actions are `POST /thing/verb`.

## HTTP app

`platform/create-app.ts` composes, in order: client IP (trusted proxies), request logging, one error handler mapping codes to statuses, compression, health, trusted-origin check, auth routes, the `/.well-known` files, the RPC handler, and the OpenAPI reference (not in production; see below).

## Jobs

`platform/jobs/define-queue.ts`: a queue has a name, a zod payload schema, a handler and retry settings. Payloads carry ids only; the handler loads what it needs. Throw to retry, return to finish (permanent failures just return and log). Register queues in `platform/jobs/queues.ts`. Jobs run in the server process on pg-boss.

## Logging

Use `@workspace/logger` (evlog) for structured events: `log.info({ action: "domain.event", ...ids })`. No `console.*` in server code. Never log secrets, tokens or full emails.
