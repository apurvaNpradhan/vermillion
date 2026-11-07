# Local-first sync: adversarial review

Date: 2026-11-07. Scope: both complete design documents, current implementation/config/tests, selected old-spike implementation and experiment records, official upstream documentation, npm registry metadata, Docker Hub tags and published Better Auth advisories.

**Update 2026-11-07:** the maintainer accepted all five CHANGE proposals (D7, D11, D15, D18, D19). They are recorded in ADRs [0020](../adr/0020-offline-web-shell.md), [0018](../adr/0018-upload-protocol.md) and [0019](../adr/0019-synced-table-conventions.md), [0022](../adr/0022-local-encryption.md), [0027](../adr/0027-sync-build-plan.md), and [0026](../adr/0026-no-e2e-and-privacy-readiness.md) respectively. The text below is the original review and is not rewritten.

**Approval boundary:** CHANGE below is a proposal, not an accepted replacement for D1–D19. No sync build phase was started. Corrections to factual claims and two existing security problems were made; implementation-policy choices remain with the maintainer.

## 1. Verdict

**Not ready to build unchanged; the core stack is worth keeping.** PowerSync plus Postgres, local SQLite, existing oRPC operations and platform-specific factories is a reasonable fit for offline fitness logging on web and native. The principal risks are missing replay/recovery semantics, incomplete web cold start, account lifecycle races and insufficient operational failure detection—not the choice of ORM. The current repository also had a confirmed critical Better Auth vulnerability, patched during this review; an exposed deployment additionally needs operator-managed secret rotation. Do not replace the stack: close the contracts and move proof earlier.

### Evidence and limits

- The repository is an unborn `main` with untracked source, as the handoff says. No commit or branch was created.
- There is no current sync implementation to certify. Old-spike tests and measurements are historical evidence, not a rerun against this template or the selected SDK/service versions. The old repository HEAD is `72b0b5d6dc08f98b30d667752c93834700f9f932`, but its working tree contains substantial uncommitted training/sync changes. This review read that working tree in place; do not attribute every inspected file to the HEAD commit. No old-repository file was modified.
- Inspected current auth, HTTP/origin/IP handling, operations, database startup/migrations, jobs/outbox/account cleanup, client session/query flow, note forms/hooks, native configuration, deployment/CI/Turbo and boundary tooling. This is not an exhaustive proof of every UI screen, dependency or production configuration.
- Registry checks are point-in-time facts, not compatibility tests. The old spike measured Chromium and one Android development build, not Safari or a standalone release build (`old/docs/decisions/0022-spike-verdict.md`).
- `old/` below means `/home/apurva/Workspace/projects/vermillion/`. All other paths are relative to this repository. Spec references name sections so formatting changes do not break the evidence.

## 2. Decision table

The alternative column compares correctness/fit, implementation complexity, operational burden, maturity evidence and lock-in. KEEP does not mean the original one-line explanation was entirely correct.

| #   | Decision                                                                                 | Verdict | Reason                                                                                                                                                                                                                | Strongest realistic alternative considered                                                                                                                                                                                                                                                                                                                                                                |
| --- | ---------------------------------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | PowerSync for Postgres-to-local-SQLite replication                                       | KEEP    | Matches both platforms and offline writes; the old spike is useful evidence. It removes the custom download engine, **not** the custom upload backend. [S1, S2; old ADR 0022]                                         | WatermelonDB: credible mobile/offline option, but custom pull/push correctness and web differences increase code and maintenance. Electric: useful Postgres download path, but durable offline writes/local SQLite integration remain application work. Neither provides a concrete enough gain to discard this spike. PowerSync does impose SDK/stream-config coupling, while Postgres remains portable. |
| D2  | Install the skill and keep reference source clones outside the repo                      | KEEP    | Cheap development aids, not production architecture. Record source SHAs and verify against pinned versions; skills are not API authority. [spec D2; handoff First steps]                                              | Official docs only: lower setup cost, but less source-level debugging. Both are low operational cost and do not alter runtime lock-in. Do not vendor moving source into the app.                                                                                                                                                                                                                          |
| D3  | Self-host Open Edition; separate bucket DB on the same Postgres                          | KEEP    | Fits existing Dokploy/private networking and local reproducibility. “One container” understates maintenance and a shared database server is a shared resource/failure domain. Cloud private endpoints exist. [S3, S4] | PowerSync Cloud: same client semantics and less WAL-service maintenance, but recurring/provider/network costs. Revisit if nobody owns backup/restore/on-call; no evidence yet justifies switching. A separate Postgres instance improves isolation but costs more to operate.                                                                                                                             |
| D4  | Port selectively from the spike                                                          | KEEP    | Old session code is already coupled to OTP and exercise search and wipes on expiry. Copying it would import incompatible behavior. [old `packages/sync/src/session.ts`]                                               | Rewrite without reading it: cleaner provenance but repeats already-discovered bugs. Selective port plus fresh contract tests is cheaper and no more locked-in.                                                                                                                                                                                                                                            |
| D5  | Isolated client Drizzle 0.45; server Drizzle RC unchanged                                | KEEP    | Registry confirms driver 0.8.0's `<1.0.0` peer; PR 911 is open. Isolate schema/types at runtime-neutral contracts. The TanStack whole-table claim is outdated. [S5, S6]                                               | Raw SQLite with zod mapping: one less ORM dependency but more conversion/query code. Kysely is credible but changes APIs without removing conversion work. TanStack DB now supports on-demand loading, but adds another query/state abstraction and is RC; no measured benefit here warrants switching.                                                                                                   |
| D6  | Notes as the proving vertical                                                            | KEEP    | Existing ownership CRUD and tests make it the lowest-cost foundation test. Do not mistake flat notes for proof of future parent/child workout invariants. [notes procedures/tests; spec D6]                           | Start with real workouts: validates richer domain rules but mixes domain design and replication failures. Small transaction/constraint fixtures can exercise the missing invariants without building fitness features now.                                                                                                                                                                                |
| D7  | Offline guards trust Device owner; request persistent web storage                        | CHANGE  | Necessary but insufficient: add an explicit offline-shell/service-worker requirement and supported web VFS/browser contract. No app code can run if a cold navigation cannot load it. [F3]                            | Native-only offline would be cheaper but violates the stated web requirement. Browser HTTP cache alone is not a reliable cold-start strategy. A narrowly scoped shell cache adds lifecycle complexity but meets the requirement without caching private API responses.                                                                                                                                    |
| D8  | Sync subdomain; endpoint supplied at runtime                                             | KEEP    | Separates the long-lived stream transport from existing path routes without moving account cookies. [spec D8; ADR 0005]                                                                                               | Same-origin reverse proxy is possible, not inherently forbidden, but adds path rewriting and streaming proxy coupling. Both mature patterns; the subdomain is simpler here. Verify CORS, CSP connect-src, buffering, idle timeouts and reconnect behavior before rollout.                                                                                                                                 |
| D9  | Better Auth JWT/JWKS, oRPC credentials/upload, vertical operations                       | KEEP    | Reuses auth and write policy. Restored the omitted credential owner/expiry fields and download guard as a security correction. JWT revocation is bounded by expiry, not instantaneous. [F2; S7]                       | Hand-rolled JWT keys or a second identity service increase key/auth lifecycle work. Existing Better Auth is the right integration after patching its security release. Do not equate the JWT with a live server session.                                                                                                                                                                                  |
| D10 | Shared sync infrastructure plus per-vertical schema/query/write code                     | KEEP    | Layout is understandable and preserves module hooks. Put transport schemas in `shared`; do not make the API depend on client Drizzle. Extend boundary enforcement. [F14]                                              | Package per vertical is more deletion-pure but creates package/config churn before the domain exists. One central blob is simpler initially but harms ownership. Current layout is the better compromise.                                                                                                                                                                                                 |
| D11 | UUIDv7, ownership, soft deletion, field-level last upload wins, explicit columns/indexes | CHANGE  | Keep the basic conventions; specify replay dedupe, dirty-field updates, delete precedence, offline retention and schema-version behavior before calling them complete. [F4–F7]                                        | CRDT/event sourcing would cost much more and would not solve permissions or validation automatically. Version-checked whole-row writes reject more offline work. Narrow field-level merging with explicit lifecycle policy is sufficient for notes; do not universalize it to counters or ordered workout children.                                                                                       |
| D12 | Query for account/admin/preferences; sync for logged data                                | KEEP    | Avoids replicating credentials/admin data and keeps offline data deliberate. Preferences must have cached/default locale behavior and never block opening local notes. [spec D12; `.agents/data-flow.md`]             | Sync every table: fewer read mechanisms but larger privacy, schema and boot-order surface. Query-only: operationally simpler but fails offline requirements. Two state mechanisms are justified by two distinct data lifecycles.                                                                                                                                                                          |
| D13 | Preserve pending writes on expiry; resume same account; warn before switching/wiping     | KEEP    | Correctly rejects the old spike's destructive expiry policy. Needs a serialized, cross-tab lifecycle and explicit local-read behavior after lock. [F2, F8]                                                            | Wipe on 401 is simpler but loses workouts. Unlimited per-account DB retention avoids switching loss but adds key/storage/privacy policy. Single-owner retention is a reasonable first version.                                                                                                                                                                                                            |
| D14 | Docker PG for DB tests, new sync seam, parity in CI                                      | KEEP    | Replication and concurrent upload tests need real PG; one DB harness avoids migration incompatibility workarounds. Pure unit tests still need no Docker. [spec Testing; current harness]                              | Keep PGlite for ordinary API tests: faster/portable but two DB harnesses and publication-conditional setup. Legitimate if test latency becomes painful, not worth maintaining by default here. Template cloning must preserve test isolation and close connections before cloning/dropping.                                                                                                               |
| D15 | SQLCipher native from day one; unused optional web encryption hook                       | CHANGE  | Keep native SQLCipher; propose dropping the speculative web `encryptionKey` hook until a supported VFS/key lifecycle is designed. Corrected the unsafe claim that all local state can be wiped. [F9]                  | Native plaintext plus OS protection is simpler but weaker for health data; use SQLCipher as agreed. A hypothetical web encryption parameter adds no security and suggests capability not yet validated. Encryption is not protection against running-app XSS.                                                                                                                                             |
| D16 | Privileged one-time bootstrap, table grants/publication in migrations                    | KEEP    | Sound least-privilege direction; database/table/publication ownership must be explicit. Setup is resumable, not globally atomic. [F10; S8]                                                                            | App runs privileged setup at each boot: fewer commands but unnecessary credentials and dangerous permissions. Admin-only publication maintenance: more deploy coordination. Keep the split, with a migrator role as a later least-privilege refinement if needed.                                                                                                                                         |
| D17 | Diagnostics, slot-lag job, service readiness                                             | KEEP    | All useful, but a job in the failing stack is not a complete alerting system and readiness is not end-to-end convergence. Expand coverage and ship the basics earlier under D18. [F11]                                | External monitoring only misses client queue/rejection failures; in-app diagnostics only cannot page an operator when the stack is down. Combine them without building a separate observability platform.                                                                                                                                                                                                 |
| D18 | Eight gated implementation phases on a feature branch                                    | CHANGE  | Move contract/security/convergence tests and basic monitoring earlier; migrate notes before activating its stream. Phase 5 must not be presented as safe to ship before account lifecycle gates. [section 7]          | Existing layer-by-layer order is easy to assign but defers discovering architectural failures. A thin vertical proof first reduces rework; keep eight checkpoints rather than start a parallel rewrite.                                                                                                                                                                                                   |
| D19 | No E2E; server search/agents; privacy features before public launch                      | CHANGE  | Keep no-E2E. Require consent/legal-basis and deletion/export/retention readiness **before collecting real health data**, not only a public launch. E2E does not inherently prevent client export. [spec D19; F16]     | E2E reduces server trust but conflicts with the stated plaintext server processing and adds key recovery/search complexity. It is not justified by current requirements. Legal obligations need qualified review; this review is not a GDPR determination.                                                                                                                                                |

## 3. Findings, severity ordered

Effort: S = focused change, M = cross-cutting implementation/tests, L = substantial platform work. “Proposed” means not implemented.

### Critical

#### F1 — Current Better Auth Expo plugin is in a confirmed account-takeover advisory range — FIXED dependency pins

- **Location:** original `pnpm-workspace.yaml:15,22`, `packages/auth/package.json:15–16`; `packages/auth/src/index.ts:232` registers `expo()`.
- **Problem:** 1.7.12 is affected by [GHSA-4wq4-2ppv-q3hg](https://github.com/better-auth/better-auth/security/advisories/GHSA-4wq4-2ppv-q3hg). Upstream states registering the server Expo plugin is sufficient; cookie caching does not need to be enabled. The email-change configuration at `packages/auth/src/index.ts:184` also matches [GHSA-hwq2-v29r-p69r](https://github.com/better-auth/better-auth/security/advisories/GHSA-hwq2-v29r-p69r).
- **Impact:** upstream describes unauthenticated account takeover. This is not a speculative sync bug.
- **Fix:** updated Better Auth, Expo, core and Drizzle adapter together to stable 1.7.18 and refreshed the lockfile. **If the endpoint was reachable, the operator must rotate `BETTER_AUTH_SECRET` after deploying the patch**, as the advisory requires; previously issued signatures remain valid otherwise. Assess affected sessions/accounts. No secrets were changed here.
- **Effort:** S for code/dependency patch; incident response scope depends on exposure. No exploit was attempted.

### High

#### F2 — Download-account isolation disappeared from the shortened credential contract

- **Location:** original spec D9/Architecture; old `packages/sync/src/connector.ts:80`; current `apps/web/src/router.tsx:21`, `apps/native/src/platform/providers.tsx:21`.
- **Problem:** upload account checking does not stop a B-token from streaming B's rows into an A-owned local database after another tab changes the cookie. Old credentials included `userId` and `expiresAt`; the spec shortened this to endpoint/token. Current Query unauthorized handling independently clears sessions.
- **Impact:** cross-account local data contamination and races between connect, revalidate, clear and switch.
- **Fix:** restored account/expiry fields and the download-owner guard in the spec. Proposed implementation: one lifecycle owner with a generation fence, cancel/await in-flight connect/upload work, stop all tab writers before clear, broadcast switch/lock state, and keep server authorization authoritative. Check both uploads and credentials against Device owner. Never trust arbitrary client `user_id` fields.
- **Effort:** M. No sync runtime code exists to patch yet.

#### F3 — “Offline cold start on web” cannot be delivered by the documented work

- **Location:** spec D7/Phases 5–6; `apps/web/vite.config.ts`; old `apps/web/vite.config.ts:26–48` and old ADR 0022 experiment 12.
- **Problem:** current web configuration has no service worker/offline shell. The successful old experiment explicitly used a precached shell, WASM and workers; the port map omitted it. TanStack Start is not the old SPA.
- **Impact:** offline navigation/restart fails before the Device owner guard can execute.
- **Fix:** proposed D7 expansion: design the app-only offline navigation shell, precache lazy routes/assets/WASM/workers, exclude auth/RPC responses, handle worker updates without losing queued work, and test cold deep links in the built web app. Keep public SSR pages and personalized responses out of indiscriminate caches. Define supported browsers, persistent-storage denial and unsupported/private-mode behavior.
- **Effort:** M. Do not copy the old `/index.html` fallback blindly. [S9]

#### F4 — Upload retries are at-least-once, but the design has no durable replay identity

- **Location:** spec Upload semantics; old `packages/sync/src/connector.ts:100` strips operations down to op/table/id/data; old `apps/api/src/sync/apply-upload.ts` has no receipt lookup.
- **Problem:** A commits title=x, its HTTP response is lost, B commits title=y, then A retries. A plain upsert/PATCH overwrites y again even though A's edit already committed. Row-id upsert alone is not sufficient replay protection under interleaving. Soft delete alone does not fix this either.
- **Impact:** lost newer edits, duplicated future side effects, spurious rejections on retry.
- **Fix:** proposed contract: stable account/install/transaction identity plus request digest; atomically store the outcome with the transaction; serialize concurrent duplicate submissions; return the same outcome after ack loss. Reject identity reuse with a different payload. Define receipt retention against the supported retry/offline horizon, including permanent refusals. If choosing operation-level idempotence instead, prove the interleaving case, not merely duplicate create.
- **Effort:** M. Official PowerSync docs explicitly require idempotent backend handling. [S2]

#### F5 — Promised rejected-write retry is not implementable from the old stored data

- **Location:** spec Upload semantics/Observability; old `packages/sync/src/tables.ts`, old connector `label` at line 141 and completion at line 157.
- **Problem:** the old record stores identity/code/label, not the attempted patch/transaction. Checkpoint reconciliation removes the rejected optimistic state, so retry has nothing trustworthy to replay. Multiple writes to the same row/op within one transaction can also collide if identity is only first-client-id/table/row/op.
- **Impact:** rejected work is reported but unrecoverable; the UI's retry promise is false. A crash between response, local rejection storage and completion adds another loss/duplication window.
- **Fix:** preserve transaction identity, operation ordinal, schema version and bounded original payload locally before completion; dedupe recording; test each crash window. Retry is a new validated transaction after user review. Keep payloads out of logs and protect/clear them with account storage. Decide explicit discard/retention behavior. Reversion is checkpoint-driven, not necessarily immediate while offline.
- **Effort:** M. This is a payload recovery contract, not a reason to invent a second general mutation queue.

#### F6 — The current UI defeats per-field merging

- **Location:** `apps/web/src/notes/components/note-form.tsx:27–38`; `apps/web/src/notes/use-notes.ts`; native note form/hook follow the same full-value pattern. Spec says components do not change.
- **Problem:** forms retain an initial title/body and submit both. If another device changes body while this form changes title, saving the stale body overwrites that other edit. SQL PATCH only preserves fields that were not sent.
- **Impact:** the “different fields both survive” headless test can pass while real users still lose edits.
- **Fix:** proposed D11 contract: retain the edit-start baseline/dirty fields and send only intentional changes. Do not compute intent by comparing against the newest live row. Add a two-form/two-device test and define conflicts when a row is deleted while its form is open. Preserve module hooks, not the claim that every component stays unchanged.
- **Effort:** M. No UI refactor was started during this review.

#### F7 — Thirty-day tombstones do not define long-offline correctness or schema compatibility

- **Location:** spec Synced table conventions, Upload semantics, Testing; old ADR 0008 upsert semantics; current `packages/api/src/notes/operations/create-note.ts:13` generates the ID server-side.
- **Problem:** no rule defines late PUT/PATCH against soft-deleted or purged rows, no maximum supported offline age, and no upload protocol version. Additive database migrations do not make a stricter validator/new required field compatible with old queued transactions. Existing create operations cannot yet honor a client's ID.
- **Impact:** resurrection, rejected legitimate old work, or retry loops after deployment; ownership must also be rechecked for foreign references in future workout transactions.
- **Fix:** propose delete-wins for ordinary edits, explicit restore as a separate allowed action, ownership-preserving duplicate handling, and an explicit offline/replay horizon before fixing tombstone GC at 30 days. Add a protocol/schema version and bounded old-client support; unsupported clients retain their queue and show upgrade/recovery guidance. Use nullable/defaulted additions first and compatibility adapters when needed. Adapt operations to accept validated client IDs and the same transaction handle, not a new independent write path.
- **Effort:** M. Parent/child validation can be tested using fixtures without implementing workouts.

#### F8 — Expiry, revocation, deletion and local unlock are conflated

- **Location:** spec D7/D9/D13 and seam 3 auth cases; `.agents/auth.md` says bans/deletions take effect on the next request; old session module wipes on unauthorized.
- **Problem:** an offline device cannot learn a remote revocation, and a previously issued JWT is not revoked by deleting its Better Auth session. Device owner cannot distinguish “network unavailable” from “permission still valid.” “Lock-and-resume” does not say whether local reads/new edits are allowed after a confirmed 401.
- **Impact:** misleading security promises, accidental wipe or indefinite local exposure; late revalidation can wipe a newly signed-in account without fencing.
- **Fix:** retain D13, but approve a state table: unclaimed, local/offline owner, online authorized, reauth required, switching, deletion confirmed. Define local read/write policy per state, delayed revocation bound, and cleanup on confirmed account deletion. Use a short JWT TTL (five minutes is an upstream example), renewal and key-rotation overlap tests. Require network auth for account/admin actions regardless of local guard.
- **Effort:** M. No remote scheme can erase a disconnected copy immediately. [S7]

#### F9 — Encryption and destructive recovery can erase the only copy of a workout

- **Location:** original D15 rationale; `apps/native/app.config.ts:47`; spec phases 5/6.
- **Problem:** local pending writes and rejected payloads are not replicas. Native key loss/backup restore can leave ciphertext with no key. `runtimeVersion: appVersion` does not automatically change when op-sqlite/SQLCipher is added.
- **Impact:** unrecoverable work or OTA JS requiring native code that an installed binary lacks.
- **Fix:** corrected the disposable-replica claim. Proposed: key creation/open failure/reinstall/backup policy, no automatic wipe on open errors, explicit user recovery/export when possible, and runtime-version bump or a separately approved fingerprint policy before incompatible OTA deployment. Verify SQLCipher on a real release binary and ensure DB/key backup exclusions are coherent. Defer the unused web hook, not native encryption.
- **Effort:** M. Encryption at rest does not stop an authenticated running app or XSS from reading the database.

#### F10 — Bootstrap is a sketch, not a safe deploy/restore protocol

- **Location:** spec Replication setup/Phases; `packages/db/src/migrator.ts:20`, `packages/api/src/platform/server.ts`; old setup SQL.
- **Problem:** database creation is outside transaction blocks, role/publication ownership is only asserted in prose, CONNECT/USAGE are omitted from the bootstrap list, and concurrent startup/migration behavior is unproven. Phase 2 activates a notes stream before phase 4 publishes notes. Test clones must not share production replication slots/config.
- **Impact:** partially provisioned environments, failed fresh startup, inconsistent grants or unsafe reruns.
- **Fix:** keep D16; preflight admin/migrator/runtime URLs and roles, use an exclusive setup/migration path, make each bootstrap step resumable with owner/grant verification, and fail closed on mismatches. A rerun must preserve publication membership. Migrate notes and publication transactionally before enabling the stream. Reversal is application/config rollback with forward-compatible schema, **not** automatic destructive down-SQL. Document restore ordering for app DB, bucket storage, slots and JWT keys; drill resnapshot while preserving client outboxes.
- **Effort:** M. Verify the installed migrator's locking before adding a second lock. [S8, S10]

#### F11 — Existing monitoring cannot detect several silent failure modes

- **Location:** spec Observability and `max_slot_wal_keep_size`; `packages/api/src/platform/health.ts:4`, mounted under `/api` in `create-app.ts`.
- **Problem:** the API/pg-boss job cannot report when its own stack is unavailable. Four GB retention can invalidate a lagging slot; it is not a guaranteed disk cap. Slot lag alone misses a wrong stream filter, stuck client queue, missing publication table or a live service serving stale data. The documented `/health` path is not the current `/api/health` endpoint.
- **Impact:** stalled sync without a page, WAL pressure, failed resnapshot, or restart loops if a dependency warning is treated as liveness failure.
- **Fix:** independent alerts for service reachability, disk, WAL retention/headroom, slot invalidation and snapshot failure; separate liveness/readiness. Client diagnostics need oldest pending age, last successful upload/checkpoint and rejection rate, not just queue count. Add a bounded synthetic test-account write/read convergence check; avoid indiscriminate production health-data hashes/logs. Alert routing and a recovery drill matter more than another dashboard.
- **Effort:** M. Budget WAL from write rate and outage/snapshot recovery time, not an unexplained constant. PG18 idle-slot invalidation is another condition to monitor. [S10, S11]

#### F12 — Development Postgres is exposed on all interfaces with a known default password — FIXED

- **Location:** original `docker-compose.yml:12–14`, original `scripts/template-init.mjs:82` and template-init assertion.
- **Problem:** `5432:5432` publishes on all host interfaces; `password` is the fallback credential. Actual external reachability depends on host networking/firewall.
- **Impact:** unnecessary LAN/public database exposure on a developer machine.
- **Fix:** bound development Postgres to `127.0.0.1`, updated the name/port rewriter and its test so template initialization does not undo the protection. Phone clients talk to the API, not directly to Postgres. Production credentials/firewall remain separate duties.
- **Effort:** S.

### Medium

#### F13 — Permanent failure classification and upload limits need an explicit wire contract

- **Location:** spec Upload semantics; old `apps/api/src/sync/rejection.ts`; old upload contract (200 ops/256 KiB); current `packages/api/src/platform/create-app.ts` and oRPC base error definitions.
- **Problem:** “validation, authorization, oversize” does not define transport statuses, whole-transaction versus per-op results, or retryable permission/session errors. The old classifier treats all application errors below 500 and SQL classes 22/23 as permanent; a foreign-key failure can depend on transaction order or missing prerequisites. Current app assembly has no explicit request-body limit.
- **Impact:** a 401/429 or version mismatch may be discarded, or a permanent request can block the queue forever; oversized input can consume resources before validation.
- **Fix:** approve and test a closed outcome table: success, durable whole-transaction rejection, session lock, wrong account, incompatible client, rate-limit/backoff, and transient infrastructure failure. Validate byte/op/field limits before expensive work, mirror transaction bounds on local writes, and never split a supposedly atomic transaction silently. Inspect known constraints rather than blanket-classifying every database data error as permanent. A response lost after rejection must remain recoverable through F4/F5.
- **Effort:** M.

#### F14 — Proposed boundaries/parity rules are not currently enforceable

- **Location:** spec Layout/Testing; `scripts/lint/boundaries-plugin.mjs:18–19`; handoff port map; current note validators live in `procedures.ts`.
- **Problem:** lint knows API/web/native trees, not `packages/sync`. Transport contracts placed only in API or client sync encourage circular/server imports or mixed Drizzle types. Column-name equality does not test wire conversion, privacy or indexes. D5's “no package imports both DB and sync” conflicts with API-located seam 3/parity tests unless test boundaries are explicit.
- **Impact:** architecture drift and parity tests that pass while production values diverge.
- **Fix:** keep runtime-neutral wire/domain schemas in `shared`; each ORM owns its schema. Extend boundary/package-export tests, with intentional test-only exceptions or a dedicated seam-3 workspace. Check stream/publication allowlists and actual SQLite indexes; test null versus empty, booleans, JSON, Unicode length semantics, timezone and numeric precision. SQL `length` and JS string length are not automatically identical for supplementary Unicode. Bind raw SQL parameters and validate conversions, not just TypeScript generics.
- **Effort:** M. Prefer a small explicit registration list and tests over a schema-generation framework.

#### F15 — Test seams are sound, but tests arrive too late and headless tests cannot prove platforms

- **Location:** spec Testing/Phases; current `.agents/testing.md`; old ADR 0022 caveats.
- **Problem:** parity/seam 3 first appear after server, both clients and lifecycle are built. Headless Node SQLite does not exercise OPFS worker/caching behavior, multi-tab identity or SQLCipher/Metro/OTA.
- **Impact:** foundational problems surface after expensive implementation; claiming “offline both platforms” from Node tests overstates evidence.
- **Fix:** establish a one-table real-service smoke and schema-parity fixture as soon as infra exists, expand each phase's tests, then run built-browser cold-start/multitab and native release-device tests. Add ack loss, duplicate simultaneous requests, local rejection-storage crashes, delete/update conflicts, reconnect storms, queue conservation, service restart, slot loss, long-offline old clients and schema rollback compatibility.
- **Effort:** M. Fault injection belongs at transport/storage boundaries, not mocks of our operations.

#### F16 — Health-data privacy readiness cannot wait merely for “public launch”

- **Location:** spec D19/deferred table; existing account deletion hooks/tests; old local-only rejected-write storage.
- **Problem:** a private beta can already process real health data. Existing account deletion removes Postgres account rows, but the new system adds bucket data, offline replicas, rejected payloads, backups and recovery logs.
- **Impact:** incomplete retention/export/deletion promises and accidental health-data leakage in observability.
- **Fix:** proposed D19 timing change: synthetic data until a qualified privacy review establishes lawful processing/consent where required, export scope, deletion propagation and backup retention. Document that disconnected copies cannot be remotely erased immediately. Reuse existing account deletion UI/flow rather than build a second one. Server/bucket/backups need encryption/access control; “no E2E” does not mean “no encryption.”
- **Effort:** M, plus operator/legal work outside this code review.

#### F17 — Existing list/update UI is a template example, not the promised scalable sync UI

- **Location:** `packages/api/src/notes/operations/list-notes.ts:13` (no LIMIT); web/native hooks; native `notes-screen.tsx` renders `notes.map`; spec list rules.
- **Problem:** all notes are fetched/rendered today; failures can appear as an empty list because hooks expose `data ?? []` without an error state. A local query failure will not necessarily hit the current Query toast handler.
- **Impact:** slow list updates at scale and false “no records” states.
- **Fix:** when building notes sync, define loading/error/first-sync/empty/offline states and stable ordering with an ID tie-breaker. Use bounded pages/keyset continuation or a consciously bounded live window, suitable composite indexes and virtualization. Memoization cannot compensate for a full-table query. Keep `updated_at` if the screen still sorts by it; the current notes UI depends on that ordering.
- **Effort:** M. No justification for replacing React Query or React itself.

#### F18 — Auth emails are not durable until the background task persists the outbox

- **Location:** `packages/auth/src/index.ts:105`; `packages/api/src/auth/operations/queue-email.ts`; `platform/background-tasks.ts`; resume-outbox operation.
- **Problem:** `notify` starts persistence in process memory and returns without awaiting it. A crash before INSERT loses an email despite an accepted auth request. Resume can recover only rows already written. Outbox INSERT and pg-boss enqueue are also separate, though persisted-row recovery mitigates the latter gap.
- **Impact:** occasional missing verification/reset/security notifications; graceful shutdown handling is not crash durability.
- **Fix:** proposed follow-up: await durable outbox persistence on the request path while keeping transport delivery asynchronous; preserve neutral enumeration responses and test persistence/enqueue failures. Do not add Redis or another queue. If best-effort notification is intentional, document it instead of describing the entire enqueue path as durable.
- **Effort:** M. Left unchanged because auth timing/enumeration behavior needs a focused design/test change.

#### F20 — Dependency health is not fully green after the auth patch

- **Location:** `pnpm-lock.yaml`, `packages/logger/package.json`, `packages/email/package.json`; `pnpm peers check` and `pnpm audit --prod --json` on the updated lockfile.
- **Problem:** evlog 2.35.1 declares React `>=19.3.1`, but the server dependency graph resolves 19.3.0. Production dependency audit reports two moderate advisories (`glob` 13.0.6, `minimatch` 10.2.6 through Expo tooling) and one low advisory (`deepmerge` 4.3.1 through email HTML-to-text). The registry/install also flags React Email components as deprecated.
- **Impact:** an unsupported peer combination and unresolved dependency advisories. Their presence is not evidence of a remotely reachable exploit in this app; the Expo paths are chiefly CLI/fingerprint tooling. No high/critical audit findings remain in this scan.
- **Fix:** follow up with an Expo-compatible React patch/grouped version check or supported evlog pin, and upstream-compatible tooling/email updates. Do not force major transitive overrides (`glob >=14.0.2`, `minimatch >=11.0.1`) without compatibility tests. Audit metadata supplies no patched deepmerge version. Assess actual untrusted-input reachability and track exceptions explicitly.
- **Effort:** S–M. Sources: [glob advisory](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4), [minimatch advisory](https://github.com/advisories/GHSA-g3hv-75wg-m249), [deepmerge advisory](https://github.com/advisories/GHSA-gcqx-w48m-w2h4). Left outside the focused security patch to avoid an untested Expo/email upgrade.

### Low

#### F19 — Clean checkout instructions and enforcement gates need precision

- **Location:** handoff First steps; README Getting started; `package.json`; `turbo.json`; `prepare-database-startup.test.ts:12–22`.
- **Problem:** first commands assumed one machine's paths, missing clone directories and installed prerequisites. `db:start` currently starts only PG. Initial lint failed only on the two specs' formatting. The full baseline suite hit a 10-second subprocess timeout; the isolated file passed. Some Turbo typecheck tasks declare `dist/**` but emit no output.
- **Impact:** an implementer may confuse scaffolding with a functioning stack or mislabel environmental timing as a functional failure.
- **Fix:** documented prerequisites and source SHA/existing-directory handling. Keep initial commit approval. Diagnose the subprocess test before increasing its timeout; investigate cold build/load contention. Align Turbo outputs with actual artifacts when touching those tasks, and disable caching or hash all real inputs for future live-service sync tests. Do not broaden CI caches blindly.
- **Effort:** S. The current PGlite harness comment claims per-test app isolation while `notes.test.ts` uses one app in `beforeAll`; retain existing actual isolation when switching to clones.

### Existing choices that are already right

- Ownership-scoped, parameterized Drizzle reads/updates/deletes and NOT_FOUND for another user's note are correct (`notes/operations/{get,update,delete}-note.ts`, `notes.test.ts`). No injection or cross-owner access was demonstrated in these inspected paths. Keep these checks inside operations when adding sync.
- Verified-admin allowlisting in `platform/orpc/base.ts`, host-only cookies, disabled session cookie cache, trusted-proxy IP resolution and origin checking are useful defenses. Do not weaken them for PowerSync; the JWT stream is a separate authorization boundary (`packages/auth/src/index.ts`, `platform/http/*`).
- Additive migrations, column ownership/cascades, the module-hook seam, shared error/i18n handling and network-boundary-only testing are sound. Fix the concrete missing sync contracts rather than reorganizing all packages (`.agents/database.md`, `.agents/data-flow.md`, current tests).
- pg-boss already gives background work a Postgres-backed home. The auth outbox explicitly separates sensitive payloads from retained job IDs. Improve its initial durability window without replacing the queue (`auth/operations/queue-email.ts`, `platform/jobs`).

### Handoff assessment

The main paths and unborn-main warning checked out. The map was **not complete**: it omitted the PWA registration/update path, `old/apps/api/src/sync/index.ts` (credentials/account checks/limits), JWT/schema/auth tests and several connector/upload regression tests. These inputs are now listed; this is an adaptation map, not an instruction to transplant all old code. The old spike's list/index/crypto pitfalls are mostly conventions today, not enforced new-system guarantees; device-plan tests, dependency peer checks, registration/parity checks and the multi-tab/cold-start suite must make them executable.

The implementer boundary is appropriately conservative for product choices, but “ask about everything else” is too broad for routine fixtures/naming. Keep decisions about loss, offline age, deletion, lock visibility, auth TTL and native key recovery with the maintainer; allow ordinary code organization within an approved contract. In particular, JWT expiry bounds revocation exposure and slot thresholds depend on a WAL budget, so neither should be chosen solely as an arbitrary constant. Original first commands can work on the author's workstation, not a clean generic checkout without README prerequisites; the handoff now makes that distinction explicit.

## 4. Things to remove or simplify

1. **Do not port the old Session wholesale.** Its OTP methods, exercise-search initialization and wipe-on-expiry are wrong for this template. Keep the lifecycle concept, not the feature coupling. [F2/F8; old session source]
2. **Propose removing the unused web encryption parameter**, not native SQLCipher. Add capability when its actual VFS/key lifecycle is selected. [D15]
3. **Do not add TanStack DB, Kysely, CRDTs, Redis or a second message broker now.** There is no measured problem they solve better than the selected stack; pg-boss and Postgres already exist. [D1/D5/D11; current services/jobs]
4. **Avoid per-operation savepoints solely to enumerate every failure.** The old uploader has one savepoint per operation and rolls back the whole transaction anyway. A first-failure result plus `SYNC_TRANSACTION_ROLLED_BACK` for siblings is simpler if approved; preserve atomicity and useful validation feedback. [old apply-upload source]
5. **Keep two schema definitions, not two competing domain models.** Explicit Postgres/SQLite mappings are justified; duplicate validators and transport types are not. Do not build code generation until parity maintenance demonstrably hurts. [D5/D10/F14]
6. **Do not replace TanStack Start with a SPA or downgrade the server ORM merely to make versions uniform.** Public SSR and current Drizzle relational adapter already exist. The offline shell and isolated client driver solve the concrete problems more cheaply. [web Vite config; auth adapter import]
7. **Do not add an index on every field mechanically.** Index the real filter/order combinations and prove installed device plans. Keep the explicit-column/privacy rule; publication membership alone is not row authorization. [spec table rules; S8/S9]

## 5. Things missing that should be added

### Before sync implementation is approved

- A wire contract for stable transaction identity/digest, operation ordinals, schema version, bounds and durable outcomes; explicit permanent/transient/reauth classification.
- A delete/update/restore and long-offline support policy tied to tombstone/receipt retention.
- An owner/auth lifecycle state table including multi-tab fencing, JWT expiry and local-lock semantics.
- An offline web-shell/VFS support contract; native key/backup/runtime policy.
- A bootstrap preflight/resume/restore checklist and early alert/recovery acceptance criteria.

### Required executable acceptance tests

- A's committed transaction response is lost; B edits; retry A must not overwrite B or duplicate effects.
- Crash after rejection persistence and before completion; restart preserves one recoverable rejection and advances the queue correctly.
- Two real note forms edit different fields; both survive; same-field order is explicitly server application order, not client wall-clock time.
- Cookie/account switch while credentials/upload/revalidation are in flight, with two tabs and an open shared worker.
- Session expiry with unsent data; same-user resume; wrong-user block; sign-out cancel/confirm; confirmed deletion.
- Late update and create against deleted/purged rows; duplicate IDs owned by another user; transaction rollback siblings.
- Old queued writes across nullable/defaulted additions and changed validators; unknown schema version does not silently discard.
- Built-browser cold restart/deep link offline, cache update, storage denial/full, unsupported VFS and worker asset failure.
- SQLCipher release binary cold start, incorrect/missing key, backup restore, runtime mismatch and release-device first sync.
- Restart PowerSync/PG, deliberately invalidate a test slot, restore/resnapshot and verify both convergence and pending-write preservation.

These extend—not replace—the existing three seams and parity test. Keep UI state correctness in platform tests and data ordering/idempotence in real-service tests.

## 6. Library and version report

Checked directly against npm registry and Docker Hub on 2026-11-07. “Current” for an uninstalled sync package means the handoff proposal, not an installed dependency. Registry metadata alone cannot certify native compatibility or absence of vulnerabilities.

| Package/image                              | Handoff or pre-review repo      | Verified upstream                                 | Assessment/action                                                                                                                                            |
| ------------------------------------------ | ------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@powersync/drizzle-driver`                | 0.8.0                           | 0.8.0; `drizzle-orm <1.0.0`, common `^2.0.0`      | Correct. Keep isolated client ORM.                                                                                                                           |
| `drizzle-orm`                              | client 0.45; server 1.0.0-rc.5  | stable 0.45.4; RC tag 1.0.0-rc.5                  | Pin tested client patch; server not outdated within its RC channel. Do not equate RC with stable.                                                            |
| `drizzle-kit`                              | no client dependency; server RC | stable 0.31.11; repository 1.0.0-rc.5             | No client migration CLI required by the selected driver. Keep server kit matched to server ORM.                                                              |
| `@powersync/web`                           | 2.6.0                           | 2.6.0; common `^2.5.0`, shared-internals `^1.5.0` | Current; pick VFS explicitly. “OPFS” alone is underspecified.                                                                                                |
| `@powersync/react-native`                  | 2.4.0                           | 2.4.0; op-sqlite `>=17.1.0 <19.0.0`               | Current. Peer range is load-bearing.                                                                                                                         |
| `@op-engineering/op-sqlite`                | range only                      | latest 19.0.5; latest stable 18.x found 18.2.5    | Latest is incompatible with selected RN SDK peer range. 18.2.5 is a candidate, not a proven Expo/SQLCipher combination.                                      |
| `@powersync/kysely-driver`                 | 2.0.3                           | 2.0.3                                             | Current but unnecessary here.                                                                                                                                |
| `@tanstack/powersync-db-collection`        | 1.0.0-rc.1.4                    | 1.0.0-rc.1.4                                      | Current RC. Official docs support on-demand loading and rich-type conversion; old eager-mode benchmark is not a universal limitation. No switch recommended. |
| `journeyapps/powersync-service`            | 1.28.1                          | 1.28.1, matching current `latest` digest          | Correct tag. Prefer digest-pinned deploys with a deliberate upgrade workflow; no new container was started.                                                  |
| `expo`                                     | SDK 58; manifest `~58.0.12`     | 58.0.23; existing lock already 58.0.23            | No SDK upgrade needed. Manifest minimum is not installed version.                                                                                            |
| `react-native`                             | 0.88.1                          | 0.88.1                                            | Current stable; retain Expo's compatibility checks.                                                                                                          |
| `expo-dev-client`                          | installed; manifest `~58.0.13`  | 58.0.18; existing lock already 58.0.18            | No patch churn needed. Rebuild for native dependency/config changes.                                                                                         |
| `better-auth`                              | 1.7.12                          | 1.7.18                                            | **Security update made**. Patched advisory floor is 1.7.16.                                                                                                  |
| `@better-auth/expo`, core, Drizzle adapter | 1.7.12                          | 1.7.18 selected together                          | **Updated together**, retain exact pins and group upgrades.                                                                                                  |
| `@powersync/node`                          | mentioned, no version           | 1.3.0; better-sqlite3 `12.x                       |                                                                                                                                                              | 13.x`, common `^2.5.0` | Add explicitly when building seam 3, including native-build policy checks. |
| `@powersync/common`, `@powersync/react`    | missing from version table      | 2.5.0 / 2.2.0                                     | Include in the tested dependency matrix; not installed by this review.                                                                                       |
| `expo-crypto`                              | mentioned, no version           | 58.0.7                                            | Use Expo-compatible install/validation and verify the UUID implementation's actual crypto needs.                                                             |
| `pg-boss`                                  | harness/lag job                 | 12.38.1                                           | Current registry latest; no queue replacement warranted.                                                                                                     |

Sources: [npm package metadata](https://registry.npmjs.org/) queried at each encoded package name; [Docker Hub tags](https://hub.docker.com/v2/repositories/journeyapps/powersync-service/tags?page_size=5&ordering=last_updated); [PR 911](https://github.com/powersync-ja/powersync-js/pull/911); [Better Auth 1.7.18 release](https://github.com/better-auth/better-auth/releases/tag/v1.7.18). Do not upgrade Drizzle on the basis of a PR merge without a released driver and tests.

The install also reports deprecated `@react-email/components@1.0.12` and its component dependencies. That is outside the handoff's sync package list; assess its migration separately rather than combine an email rendering rewrite with sync. No reviewed evidence establishes that the chosen PowerSync SDKs are abandoned or deprecated.

### Current alternatives: why not switch?

- **WatermelonDB:** established offline/mobile pattern, but its frontend requires compatible backend pull/push endpoints. Custom backend sync correctness is exactly what PowerSync reduces. [S12]
- **Electric:** credible Postgres-to-client downloads, with application-managed write patterns. A switch does not eliminate the durable offline outbox, auth, rejection and schema obligations identified here. [S13]
- **Zero:** current official connection docs explicitly reject writes in disconnected/error/needs-auth states and say it is not designed for long periods offline. That is the wrong primary requirement fit regardless of attractive query APIs. [S14]
- **RxDB:** credible cross-runtime offline document database and custom replication protocol; storage/license and mapping choices need a separate evaluation. No evidence here demonstrates enough gain to replace already-tested relational SQLite/Postgres integration. [S15]
- **Custom SQLite plus sync endpoints/CRDTs:** maximum control but makes this project own checkpoints, resnapshot, recovery, conflict semantics and operational debugging. Not the simplest implementation.

These are requirements comparisons, not universal product rankings or fresh performance benchmarks.

## 7. Revised build plan — proposed; requires D18 approval

Keep the feature branch and final gates. Early checkpoints are mergeable infrastructure, not independently user-shippable offline features.

1. **Contract and baseline:** approve review decisions; patch security baseline; obtain base-commit approval; record upstream versions/SHAs; define upload identity, error/state tables, supported offline horizon, browser shell/VFS and native key/runtime policy. Exit: current tests green and acceptance fixtures agreed. ADRs describe approved decisions, not unresolved proposals as facts.
2. **Repeatable infrastructure:** PG logical WAL, least-privilege roles/storage/publication bootstrap, preflight/resume tests, env/deployment wiring and initial probes/alerts. Start with empty sync configuration if notes is not migrated yet. Exit: clean boot, repeat boot and injected partial bootstrap recovery.
3. **Real PG harness and minimal sync seam:** clone an immutable migrated template, isolate per-file/per-instance state, explicit role/slot cleanup, remove PGlite adapter, scaffold a real-service test in CI and parity infrastructure. Exit: existing API suite passes on PG; service test infrastructure fails usefully on missing prerequisites.
4. **One-table server proof:** migrate notes constraints/soft-delete/publication/grants, then activate its stream; add JWT credentials and atomic upload/receipt handling through operations. Exit: headless round trip, ownership isolation, replay/ack loss, rejection and rollback tests pass before platform UI work.
5. **Platform storage and lifecycle:** client schema/connector, bounded queries, web VFS/offline shell, native SQLCipher/crypto, serialized Device owner/auth switching, 401 queue preservation, rejected payload recovery, minimal diagnostic state. Exit: browser cold restart/multitab tests; pause for native rebuild/runtime validation. No user rollout before the lifecycle tests pass.
6. **Notes UX:** module hooks, dirty-field forms, explicit loading/error/empty/sync states, bounded/virtualized lists, sign-out warning, retry/discard UI and i18n. Exit: real two-device editing, rejection recovery and session expiry walkthrough.
7. **Fault/compatibility proof:** full seam 3 and parity CI, old-client upload/schema cases, delete races, process/slot/storage failures, cold browser and native release tests, device query plans and first-sync measurements. Exit: deterministic convergence/queue-conservation tests and a recorded native/browser support matrix.
8. **Operational handoff and privacy gate:** restore/resnapshot drill, alert delivery, runbooks, adding-table guide, glossary, privacy/export/deletion/retention sign-off before real health data. Exit: deploy/rollback/recovery rehearsed; no silent divergence path without an alert or visible diagnostic state.

## 8. Action

Changes made in this review:

- Added this evidence-backed review and unapproved decision/build-plan proposals.
- Corrected spec/handoff factual claims, restored credential account isolation, recorded readiness gaps and revision logs. No numbered decision was silently reversed.
- Patched the Better Auth family to 1.7.18 and regenerated `pnpm-lock.yaml` for the confirmed security advisories. Added `packages/api/src/auth/expo-proxy.test.ts` to exercise the actual HTTP route: untrusted redirects are rejected and caller-issued state is not signed even for a configured provider.
- Restricted development Postgres to localhost and updated `template-init` plus its test to preserve the restriction.
- No sync package/phase, production deployment, secret rotation, commit or branch was created.

### Validation

Checks ran under the available Node 22.23.4 / pnpm 12.15.0; README and CI target Node 24, which remains a separate release validation environment.

| Check                                    | Result                                                                                                                                                                                                              |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm lint`                              | PASS after formatting the reviewed documents and changed files                                                                                                                                                      |
| `pnpm typecheck`                         | PASS; existing Turbo no-output warnings remain                                                                                                                                                                      |
| `pnpm knip`                              | PASS                                                                                                                                                                                                                |
| `pnpm i18n:check`                        | PASS                                                                                                                                                                                                                |
| `pnpm test` after auth dependency update | PASS, including 125 API tests before adding the two new regressions                                                                                                                                                 |
| Final `pnpm test` with regressions       | FAIL: 126 API tests pass, including the two new tests; one pre-existing startup subprocess test hits `spawnSync pnpm ETIMEDOUT` at its 10-second deadline. Other workspace/root tasks pass (some Turbo cache hits). |
| Startup test in isolation                | PASS, 8/8                                                                                                                                                                                                           |
| `docker compose config --quiet`          | PASS; configuration validation only, no service started                                                                                                                                                             |
| `pnpm template:init --dry-run`           | PASS, zero files would change                                                                                                                                                                                       |
| `pnpm peers check`                       | FAIL: evlog React peer mismatch (F20)                                                                                                                                                                               |
| `pnpm audit --prod --json`               | Nonzero: 2 moderate, 1 low; 0 high/critical in this scan (F20)                                                                                                                                                      |

Baseline before edits already had the same startup subprocess timeout (124 passed, 1 failed), and lint failed only on formatting of the two input specs. The timeout was not hidden by increasing it or deleting the test. A serial API rerun is recorded below to distinguish concurrency sensitivity from a functional regression. Browser e2e, native device/release builds, sync integration and production recovery were **not run**. The sync implementation does not yet exist.

## External references

- **S1:** [PowerSync architecture](https://docs.powersync.com/architecture/architecture-overview.md).
- **S2:** [PowerSync conflicts and idempotence](https://docs.powersync.com/handling-writes/handling-update-conflicts.md).
- **S3:** [PowerSync self-hosting](https://docs.powersync.com/intro/self-hosting.md).
- **S4:** [PowerSync Cloud private endpoints](https://docs.powersync.com/configuration/source-db/private-endpoints.md).
- **S5:** [Driver metadata](https://registry.npmjs.org/@powersync%2fdrizzle-driver), [Drizzle v1 PR](https://github.com/powersync-ja/powersync-js/pull/911).
- **S6:** [PowerSync/TanStack DB: on-demand and rich types](https://docs.powersync.com/client-sdks/orms/js/tanstack-db.md).
- **S7:** [Custom JWT auth and key rotation](https://docs.powersync.com/configuration/auth/custom.md). This page has inconsistent maximum-expiry wording in different sections; use/test a short TTL rather than rely on the ambiguous upper bound.
- **S8:** [Postgres logical replication security/privileges](https://www.postgresql.org/docs/18/logical-replication-security.html).
- **S9:** [Web SDK VFS and multi-tab behavior](https://docs.powersync.com/client-sdks/reference/javascript-web.md).
- **S10:** [PowerSync slot maintenance/recovery](https://docs.powersync.com/configuration/source-db/postgres-maintenance.md).
- **S11:** [PowerSync production readiness](https://docs.powersync.com/maintenance-ops/production-readiness-guide.md).
- **S12:** [WatermelonDB sync frontend](https://watermelondb.dev/docs/Sync/Frontend), [backend](https://watermelondb.dev/docs/Sync/Backend).
- **S13:** [Electric write patterns](https://write-patterns.examples.electric-sql.com/).
- **S14:** [Zero connection/offline write policy](https://zero.rocicorp.dev/docs/connection).
- **S15:** [RxDB replication](https://rxdb.info/replication.html), [React Native storage](https://rxdb.info/react-native-database.html).
