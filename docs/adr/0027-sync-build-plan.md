# 0027. Build the sync feature in eight proof-first phases

Status: accepted (2026-11-07). Covers D18 (amended).

## Context

The original order built infrastructure, tests, server, clients and lifecycle in layers and proved convergence last. The adversarial [review](../specs/local-first-sync-review.md) found that foundational problems would surface after the expensive work.

## Decision

Build on `feat/local-first-sync`, branched from base commit `d624003`, in the eight phases defined in the [spec](../specs/local-first-sync.md#phases) (review section 7), which holds each phase's scope and exit criteria:

1. Contract and baseline.
2. Repeatable infrastructure.
3. Real Postgres harness and minimal sync seam.
4. One-table server proof.
5. Platform storage and lifecycle.
6. Notes UX.
7. Fault and compatibility proof.
8. Operational handoff and privacy gate.

Each phase ends green on `pnpm lint`, `pnpm typecheck`, `pnpm knip`, `pnpm test`, `pnpm i18n:check`, then a conventional commit. Early phases are mergeable infrastructure, not user-shippable offline features; no user rollout before the phase 5 lifecycle tests pass. Phase 5 pauses for a native dev-client rebuild.

## Consequences

- Contract items the review leaves open are settled in the phase named in each ADR, with the maintainer deciding loss, offline age, deletion, lock visibility, JWT expiry and native key recovery. Routine code organization within an approved contract is the implementer's call.
- The spec is the single source for phase content; this ADR records only the decision and the order.
