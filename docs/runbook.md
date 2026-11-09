# Runbook

The short list of things to do by hand. Setup and configuration reference: [deployment.md](deployment.md).

## Deploy

Merging to `main` ships both halves of the same commit:

- **Web**: CI runs `checks`, `e2e` and `workflows`, then the `deploy-web` job builds and runs `wrangler deploy` (needs the `DEPLOY_WEB` variable, see deployment.md). Watch it in the Actions tab.
- **Server**: Dokploy builds `apps/server/Dockerfile` from `main` and replaces the container. It waits for Postgres, migrates, then listens. Watch the deployment log; `db.startup` and `server.listening` are the two lines that matter.

The web Worker and the server deploy independently, so for a few seconds they can be one release apart. That is why migrations and API changes are additive: an old Worker must work against the new server and the reverse.

If the container loops on start, a migration failed. The old container is already gone, so the site's API is down: roll back (below) and read the `db.startup` error.

## Roll back

| Half   | How                                                                                                                                                                     |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web    | Cloudflare dashboard → Workers → the app → Deployments → pick the previous version → _Rollback_. Or revert the commit on `main` and let CI deploy.                      |
| Server | Dokploy → the application → Deployments → _Rollback_ to the previous image (Dokploy keeps recent builds when rollbacks are enabled), or revert the commit and redeploy. |
| Native | `eas update:rollback` for the channel, or publish the previous commit with `eas update`. A store build cannot be rolled back; ship a fix.                               |

A rollback never undoes migrations. Because migrations are additive, the previous code runs on the newer schema. Only if a migration changed data in a way the old code cannot read, restore a backup first (below).

## Postgres and backups

Postgres is a separate Dokploy database service in the same project, with no external port.

1. Dokploy → **Destinations** → add an S3-compatible destination. For Cloudflare R2: endpoint `https://<account-id>.r2.cloudflarestorage.com`, region `auto`, a **private** bucket used only for backups, and an API token scoped to that bucket (Object Read & Write). Never reuse a public bucket: dumps contain sessions and email addresses.
2. The database service → **Backups** → schedule `0 3 * * *` (daily) to that destination, retention 14 days.
3. Run the restore drill once, and again whenever backups change.

Backups cover Postgres only. pg-boss keeps its jobs in the `pgboss` schema of the same database, so they are included.

## Restore drill

Proves a backup restores. Needs Docker locally.

1. Download the newest backup from the bucket.
2. `scripts/ops/restore-drill.sh path/to/backup.sql.gz` restores it into a throwaway `postgres:18` container, lists row counts for the core tables (`user`, `session`, `account`, `user_preferences`, `notes`) and removes the container. It reads gzipped SQL, plain SQL and `pg_dump` custom archives.
3. Note the date and result where your team keeps operational notes.

A fork that renames or removes tables edits the `tables` list at the top of the script.

To restore for real: stop the server application in Dokploy, restore the backup into the database service from its Backups screen (or `pg_restore` / `psql` against its connection string), then start the server. Sessions in the backup become valid again, so a restore taken before a secret rotation brings old sessions back.

## Background jobs

Jobs run on pg-boss inside the server process, in the `pgboss` schema (the database role must be able to create it on first start). Finished jobs are kept for a few days with IDs only. Sensitive email content lives in the user-owned `auth_email_outbox` while delivery is pending, and is removed after delivery or a final failure; deletion cascades with the user. Expired content is discarded on processing/enqueue. The first upgrade from content-bearing auth jobs must stop the old server before starting the outbox release: it preserves pending messages in the outbox and redacts legacy retained job payloads. Never run old content-format workers against the new ID-only format. When emails stop arriving:

```sql
select name, state, count(*) from pgboss.job group by 1, 2 order by 1, 2;
select name, retry_count, output from pgboss.job where state = 'failed' order by created_on desc limit 20;
```

Failed jobs log `jobs.*` actions. Fix the cause (a bad `RESEND_API_KEY` is the usual one); retries cover short provider outages. A redeploy drains pending sign-in emails for up to 10 seconds, anything left stays in Postgres and runs on the next start.

## Rotate secrets

Change the value in Dokploy's environment for the server application and redeploy. The Worker holds no secrets.

| Secret                        | Effect                                                                                                                                                                                                                                            |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BETTER_AUTH_SECRET`          | Every session and signed value stops working; everyone signs in again. Database-backed deletion tokens and sign-in codes do not die: revoke them explicitly using the procedure below.                                                            |
| `RESEND_API_KEY`              | Takes effect on restart. Queued emails retry with the new key.                                                                                                                                                                                    |
| `TURNSTILE_SECRET_KEY`        | Takes effect on restart. The site key is public and baked in at build time: change `VITE_TURNSTILE_SITE_KEY` (GitHub variable, then redeploy web) and `EXPO_PUBLIC_TURNSTILE_SITE_KEY` (new native build) together with the widget in Cloudflare. |
| Google / GitHub OAuth secrets | Takes effect on restart.                                                                                                                                                                                                                          |
| `DATABASE_URL`                | Change in step with the database service's password.                                                                                                                                                                                              |
| `CLOUDFLARE_API_TOKEN`        | Roll it in Cloudflare, update the GitHub environment secret, re-run the last deploy.                                                                                                                                                              |

For a compromised auth secret or leaked deletion links or sign-in codes, stop the server before rotation. Revoke database-backed tokens and sessions in Postgres, then deploy with the new secret:

```sql
begin;
delete from verification where identifier like 'sign-in-otp-%' or identifier like 'change-email-otp-%' or identifier like 'delete-account-%';
delete from session;
commit;
```

This deliberately invalidates all outstanding sign-in codes and deletion confirmations and all sessions. Users must request new links. Never paste token values into incident logs. Also remove pending auth-email outbox rows (`delete from auth_email_outbox`) so stale links are not delivered after restart.

## Close sign-ups

Set `REGISTRATION_OPEN=false` on the server application and redeploy. Existing users are unaffected, and addresses in `ADMIN_EMAILS` can still register. Reopen with `true`.

## Admin access

`ADMIN_EMAILS` is the only source of admin rights. Add or remove an address and redeploy: roles are reconciled at startup and on every session, so a removed admin loses access at their next request. The address must be verified.

## Scheduled reminders

- Twice a year: compare Cloudflare's IP ranges with `TRUSTED_PROXIES`, Traefik's `forwardedHeaders.trustedIPs` and the firewall allowlist.
- After any change to the backup setup: run the restore drill.
- Monthly: merge Renovate's grouped update PR; oRPC 2 and Drizzle 1.0 are pre-release, so read their release notes first.
