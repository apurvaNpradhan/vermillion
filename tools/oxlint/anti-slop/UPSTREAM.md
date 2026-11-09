# anti-slop provenance

- Source: https://github.com/dmmulroy/anti-slop
- Commit: `13909c9e07590f5a85d93c62712259fe14a883f7` (2026-10-13), copied from `src/`.
- Installed at: `tools/oxlint/anti-slop/` (entry point `index.ts`, registered in `.oxlintrc.json`).
- Replaces the earlier partial copy at `tools/oxlint/type-safety/` (same rule sources, reformatted).

## Intentional deviations

- Not copied: `*.test.ts` RuleTester suites, the `effect/` plugin (no direct Effect dependency).
- Removed: `require-readable-spacing` and its vendored ESLint Stylistic engine. Formatting belongs to oxfmt,
  and the template does not port stylistic lint rules.
- Removed: `no-conditional-empty-object-spread`. Without `exactOptionalPropertyTypes`, omitting a key and
  assigning `undefined` differ for Drizzle patches, Better Auth options and the Expo config, so the
  conditional spread is the correct idiom here.
- `no-runtime-typeof` runs with `allowInTypeGuards: true` and is off for `scripts/**` and `tools/**`.

To update, diff upstream `src/` against this directory and port changes rule by rule; keep the list above current.
