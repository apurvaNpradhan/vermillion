# 0003. Personal accounts only, one `authed` seam

Status: accepted (2026-11-06).

## Context

The base serves a single-user fork and a collaboration fork. Organizations, workspaces, members, invitations and RBAC are out of scope here.

## Decision

The base supports personal accounts. The oRPC base exposes `public`, `authed` and `admin` builders. `authed` is the single place that resolves the signed-in user; the collaboration fork extends it to require workspace membership instead of adding a second system.

## Consequences

- No workspace concepts leak into the base tables or procedures.
- The collab fork takes workspaces, members and RBAC from morrow.
