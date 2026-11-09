# Privacy readiness checklist

The gate for [ADR 0026](adr/0026-no-e2e-and-privacy-readiness.md) (D19). Until every item is signed off, use **synthetic data only**: no real health data, including in a private beta.

This is an engineering checklist for qualified review. It is not legal advice and makes no legal determination. Values (retention periods, legal basis) are for the maintainer and a qualified reviewer to decide; none are chosen here.

| Area                          | Check                                                                                                                                                                                | Status |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| Consent and legal basis       | Legal basis for processing health data (GDPR Art. 9 and any other regime that applies) identified by a qualified reviewer. Consent text, versioning and withdrawal flow exist.       | open   |
| Notices                       | Privacy notice states: server-readable data (no end-to-end encryption), sync to devices, processors, retention, and that a disconnected device copy cannot be erased remotely.       | open   |
| Export scope                  | Define what an export contains: synced tables, rejected-write payloads, preferences, account data. Verify an export matches the server and local replica.                            | open   |
| Deletion propagation          | Account deletion (the existing flow) removes rows, tombstones, upload receipts, bucket data, rejected payloads, and logs/backups per the retention decision.                         | open   |
| Offline devices               | A device offline during deletion wipes local data on next confirmed deletion; the device must also hold no queued writes revived after deletion. Behavior tested; limits documented. | open   |
| Retention                     | Periods decided for tombstones and receipts (120 days today), deleted-id/owner markers (until account deletion; no content), logs, `powersync_storage`, and backups.                 | open   |
| Backup retention              | Backup schedule and retention (runbook default 14 days) agree with deletion promises; how deleted users are handled on restore is defined.                                           | open   |
| Server and bucket encryption  | Disk or volume encryption for Postgres, `powersync_storage` and the backup bucket; TLS for all hops (`PS_SSLMODE=verify-full`); bucket private; access limited and reviewed.         | open   |
| Local encryption              | Native SQLCipher verified on a release binary ([native-dev](guides/native-dev.md)). Web has no local encryption; stated in the notice and risk assessment.                           | open   |
| Logs and observability        | Confirm no health payloads, tokens or rejected-write payloads in logs, alerts or error reports. Spot-check production-like logs.                                                     | open   |
| Access control                | Who can read production data (admins, operators); procedure and audit for that access; MCP/agent access deferred until reviewed.                                                     | open   |
| Processors and transfers      | List processors (hosting, email, CDN) and data location; agreements in place.                                                                                                        | open   |
| Data subject requests         | Procedure and time limits for access, rectification and erasure requests.                                                                                                            | open   |
| Incident response             | Breach detection and notification procedure ([runbook](runbook.md)).                                                                                                                 | open   |
| Synthetic data until sign-off | Environments and demos contain only synthetic data; sign-off date, reviewer and decisions recorded here.                                                                             | open   |

Sign-off: reviewer, date, decisions and open risks are to be recorded below by the maintainer.

Not yet signed off.
