# 0026. No end-to-end encryption; privacy readiness before real health data

Status: accepted (2026-11-07). Covers D19 (amended).

## Context

The product intends server-side search (pg_trgm, tsvector, pgvector), AI agents and an MCP server over user data, plus server validation. A private beta already processes real health data, so waiting for a public launch is too late for privacy obligations.

## Decision

- No end-to-end encryption. The server reads user data; search, agents and MCP work through Postgres and vertical operations, and their writes reach devices through sync. Client-side export remains possible. "No E2E" does not mean "no encryption": server, bucket storage and backups need encryption and access control.
- Until privacy readiness is signed off, use synthetic data only. Readiness is required before collecting real health data, not merely before public launch: consent and legal basis (GDPR Art. 9 health data), data export scope, deletion propagation, retention and backup retention. Qualified review is needed; the engineering [review](../specs/local-first-sync-review.md) is not a legal determination.
- Reuse the existing account deletion flow rather than build a second one. Deletion must cover bucket data, local replicas, rejected payloads, backups and recovery logs. Disconnected copies cannot be erased remotely at once; say so.
- Observability and logs never contain health payloads.

## Consequences

- Open item, phase 8: privacy sign-off (legal basis, export scope, deletion propagation, retention periods, backup retention). These need the maintainer and outside review; no values are chosen here.
- Audit log (`actor` on operations) and MCP auth stay deferred until the first agent or external client.
