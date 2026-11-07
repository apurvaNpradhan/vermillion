# 0006. Postgres-backed jobs run inside the server process

Status: accepted (2026-11-06).

## Context

Emails and cleanup must survive a temporary provider outage and should not run on the request path. The operator wants one container to deploy and watch.

## Decision

pg-boss runs inside the server process, in the `pgboss` schema of the app database. Queues are defined by name, zod payload schema, handler and retry settings; payloads carry ids only. Sign-in and verification emails are queued. On shutdown the server stops accepting requests and drains pending jobs for a bounded time (10 s). A separate worker process is out of scope.

## Consequences

- Run one replica: in-memory rate limits and job workers live in the same process.
- Splitting out a worker later means moving the queue registration, not rewriting queues.
