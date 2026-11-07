# 0021. Device owner and account lifecycle

Status: accepted (2026-11-07). Covers D13, and the lifecycle half of D7.

## Context

A workout logged offline must not be lost to an expired session. The Device owner is a local identity, not server authorization. An offline device cannot learn a remote revocation. The earlier spike (`~/Workspace/projects/vermillion`) wiped the database on 401 and raced between connect, revalidate and sign-out.

## Decision

- On session expiry (401) with local data: keep the database, stop uploads, show "sign in again". The same user signing in resumes the queue. A different user wipes, with a warning first if writes are pending. Explicit sign-out with unsent writes asks first.
- Never auto-wipe on transport errors, open errors or expired credentials.
- One lifecycle owner serializes connect, upload, revalidate, clear and switch behind a generation fence. In-flight work is cancelled or awaited, all tab writers stop before a clear, and switch or lock state is broadcast across tabs. Credentials and uploads are both checked against the Device owner.
- Lifecycle states are specified: unclaimed, local/offline owner, online authorized, reauth required, switching, deletion confirmed. Local read and write policy is defined per state, including what is allowed after a confirmed 401.
- Policy (settled 2026-11-07): no app lock. With an expired session, local data stays readable and writable, uploads pause and a "sign in to sync" banner shows. A different user signing in is blocked: switch back to the owner, or discard after a confirmation that shows the unsent count. The local database is wiped only after server-confirmed account deletion. The OS screen lock is the device boundary.
- Confirmed account deletion cleans local data. A disconnected copy cannot be erased remotely and the privacy documents say so.
- Do not port the old Session wholesale: keep the lifecycle concept, not its OTP or exercise-search coupling.

## Consequences

- Settled in phase 4: the token lives 5 minutes, so the revocation window is at most 5 minutes ([0017](0017-sync-credentials-and-transport.md)).
- Phase 5 must pass cross-tab and in-flight switch tests before any user rollout.
- Settled in phase 5 (client wiring, `packages/sync`):
  - The Device owner is a singleton row in the local-only `device_owner` table, written in one write transaction at the first sign-in. The state machine (`lifecycle-state.ts`, pure) has phases `starting`, `unclaimed`, `active`, `reauth-required`, `blocked`, `switching` and `update-required`; the controller runs its effects (claim, connect, disconnect, wipe) one transition at a time behind `navigator.locks` (web) and a generation fence that drops signals from torn-down connections. Tabs tell each other of a claim or wipe over a `BroadcastChannel` and re-read the owner from the database.
  - An owned database connects at start without waiting for a session. A 401, or a session lookup that answers "nobody", moves to `reauth-required`: local reads and writes continue, uploads and downloads stop. A lookup that fails (offline) says nothing and changes no state. Credentials or an upload answered with another account (`SYNC_WRONG_ACCOUNT`, or credentials for a different `userId`) move to `blocked`; a cached session of the owner does not lift a block that came from the server, only a fresh sign-in does.
  - Explicit sign-out never wipes. With unsent changes it asks first and says they stay on the device and upload after the same account signs in again. The only wipes are the confirmed discard from `blocked` (the dialog shows the unsent count) and the owner's server-confirmed account deletion. A wipe also clears the local-only tables, so the install id is new afterwards ([0018](0018-upload-protocol.md)).
  - The deletion email is opened later and often signed out, so the account page remembers whose deletion was requested (`localStorage` on web, device storage on native) and the confirmed landing wipes only if that account is the owner.
  - `SYNC_CLIENT_INCOMPATIBLE` stops sync (`update-required`) until the app restarts on a newer build. `SYNC_REPLAY_MISMATCH` and `SYNC_INVALID_REQUEST` are client faults that no retry fixes; the connector keeps the queue and throws rather than discard writes.
  - The oldest-pending age is kept in memory (PowerSync's CRUD queue has no timestamps), so after a restart it counts from the restart.
  - Cross-tab and in-flight tests run against a real SQLite file with only the network faked; real two-tab OPFS behaviour still needs a browser pass before rollout.
