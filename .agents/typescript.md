# TypeScript

TypeScript 7 (native compiler) for typechecking; `pnpm typecheck` runs it per workspace.

## Infer, do not restate

- Derive types from their source: a Drizzle table, a zod schema (`z.infer`), a function's return type. When a type is wrong, fix the schema or signature, not the call site.
- Validate at boundaries (user input, network, env, storage) with zod. An assertion does not validate.
- Parse once at the nearest I/O boundary. Call `parse` / `safeParse` directly; add a helper only for normalisation or error mapping.

## Lint rules that block merges

`tools/oxlint/anti-slop` (vendored from [anti-slop](https://github.com/dmmulroy/anti-slop); see its `UPSTREAM.md`) runs in `pnpm lint`:

- `as` needs a comment starting with the safety justification, right above it. No chained assertions (`as unknown as T`), no widen-then-assert.
- No `unknown` or `object` as a parameter, return or alias; no `Record<string, unknown>` / loose dictionaries. Give the value a real type or a zod schema.
- Do not widen a known literal or union to `string`.
- No ad hoc `typeof` narrowing: parse with zod at the boundary. `typeof` is allowed inside a type predicate (`x is T`) and for `=== "undefined"` existence probes.
- No `vi.mock` / module mocking; no `Reflect.get` / `Reflect.apply`; no `shape` in symbol names.
- No `.filter().map()` passes or accumulator copies in reducers; use `.values().filter().map().toArray()`, `flatMap`, or a mutated local accumulator.

Tests are exempt from the assertion rules; `scripts/` and `tools/` are exempt from the `typeof` rule.

## Use `satisfies` for config

Check a value against a contract while keeping its inferred type: `const x = {...} as const satisfies Contract`.

## Placement

- One-off schemas stay inline. Extract only for reuse, next to the narrowest common owner.
- `packages/shared` holds runtime-agnostic zod contracts and pure helpers used across packages. Nothing there may import React, the DB, env or the network.
- Database tables live in the owning vertical's `tables.ts`.
