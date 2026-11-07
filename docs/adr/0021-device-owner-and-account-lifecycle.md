# 0021. Device owner and account lifecycle

Status: accepted (2026-11-07). Covers D13, and the lifecycle half of D7.

## Context

A workout logged offline must not be lost to an expired session. The Device owner is a local identity, not server authorization. An offline device cannot learn a remote revocation. The earlier spike (`~/Workspace/projects/vermillion`) wiped the database on 401 and raced between connect, revalidate and sign-out.

## Decision

- On session expiry (401) with local data: keep the database, stop uploads, show "sign in again". The same user signing in resumes the queue. A different user wipes, with a warning first if writes are pending. Explicit sign-out with unsent writes asks first.
- Never auto-wipe on transport errors, open errors or expired credentials.
- One lifecycle owner serializes connect, upload, revalidate, clear and switch behind a generation fence. In-flight work is cancelled or awaited, all tab writers stop before a clear, and switch or lock state is broadcast across tabs. Credentials and uploads are both checked against the Device owner.
- Lifecycle states are specified: unclaimed, local/offline owner, online authorized, reauth required, switching, deletion confirmed. Local read and write policy is defined per state, including what is allowed after a confirmed 401.
- Confirmed account deletion cleans local data. A disconnected copy cannot be erased remotely and the privacy documents say so.
- Do not port the old Session wholesale: keep the lifecycle concept, not its OTP or exercise-search coupling.

## Consequences

- Open item, phase 1 exit: offline access versus reauthentication lock policy (what a locked device may read or edit, and for how long), as a maintainer decision.
- Open item, phase 4: JWT expiry and so the revocation window ([0017](0017-sync-credentials-and-transport.md)).
- Phase 5 must pass cross-tab and in-flight switch tests before any user rollout.
