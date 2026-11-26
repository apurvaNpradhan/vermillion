# Agent slices

How a round of work is split into slices and run by delegated agents. The orchestrator reads this
before writing any build or review brief, and pastes the matching brief section into the task.
A brief then adds only what is specific to the slice: branch, spec section, its own risks.

## Pipeline

1. **Build** (Sonnet medium, own worktree from `feat/redesign`): implement the slice, test-first at
   the spec's seams, run the full gate, commit, report the gate output verbatim.
2. **Review and fix** (Codex `gpt-6.2-sol` medium, same worktree): review the diff, fix every
   finding it can, commit, report findings with what changed. One task, not two.
3. **Orchestrator check**: read the fix commits against the findings. Small fixes are merged after
   that read. Send a **re-check** only when the review found blockers in sync, migrations, auth or
   data loss; a re-check is read-only, medium effort, and is given the fixer's gate output.
4. **Merge** into `feat/redesign` locally, run the gate once on the merge, never push.

Alternate the models: while Sonnet builds slice N, Codex reviews and fixes slice N−1. Slices that
touch the same shared files (`en.json` excepted: it merges by key), the same sync tables,
`sync-config.yaml`, parity tests or shared helpers run one after another, not side by side.

## Usage limits

A task that reports a usage limit, rate limit or "resets at" is cancelled at once (`task_cancel`)
and handed with its worktree and WIP to the other model. Waiting for the limit to reset has cost
4–16 hours per task. A task silent for twice its usual time (build 50 min, review 10, fix 25) is
checked once with `task_status`.

## The gate

`pnpm lint && pnpm typecheck && pnpm knip && pnpm i18n:check`, then the tests through the shared
lock: `flock ~/.cache/vermillion-test.lock pnpm test` (tests need `pnpm db:start`). The lock makes
parallel agents take turns: two full test runs at once push the load past 30 and API tests time
out at random. Builders and fixers run the gate; reviewers and re-checkers read its output and
run only a single targeted test when probing a suspected bug.

A fresh worktree has no `apps/native/.expo/types/router.d.ts`, so typecheck there accepts any
route string. A slice that adds or renames a route regenerates it first:
`cd apps/native && CI=1 timeout 60 npx expo start --offline`.

Worktrees share one Turbo cache through `TURBO_CACHE_DIR` (set in the shell profile), so unchanged
packages hit the cache across worktrees.

## Build brief

- Repo, worktree, base commit, spec path and section.
- Read AGENTS.md, CONTEXT.md and the `.agents/` guides the slice touches.
- Shared helpers already on `feat/redesign` that the slice must reuse (name them: deterministic
  ids, slot state, phase text, gym loads…). A new helper that a parallel slice may also need is
  named in the brief so only one slice creates it.
- Done means: every spec item for the slice delivered or listed as not done with a reason, gate
  green, commits made, gate output pasted in the final report.

## Review brief

Read-only review of `git diff feat/redesign...<branch>`, then fix (step 2). Report every finding
ranked by severity with file:line, a concrete failure scenario and the fix applied, then an
explicit merge verdict. Check, as each applies:

- **Spec**: every item of the slice's spec section delivered; nothing beyond it.
- **Sync**: additive migration, publication and grants, `sync-config.yaml` stream, upload handler
  and server validation of ownership, parity test, deterministic ids where two devices can create
  the same row, both upload orders, old clients omitting a new field.
- **Domain**: CONTEXT.md terms in code and docs; plain words in the UI (see Voice).
- **UI**: brand tokens, no borders, 44 pt targets, accessibility labels and hints, every string in
  `en.json`, no action reachable only by swipe or long press.
- **Voice**: short, factual, second person, sentence case, no exclamation marks, no streak guilt;
  internal terms (Run, Cycle, Slot, baseline, modifier, override) stay out of visible copy.
- **Tests**: behaviour at the agreed seam, not implementation details; our own modules unmocked.
