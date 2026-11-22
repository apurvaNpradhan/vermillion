# Runbook

The short list of things to do by hand. Setup and configuration reference: [deployment.md](deployment.md).

## Deploy

Merging to `main` runs CI (`checks`, `tests`, `sync`, `workflows`; watch the Actions tab). A change that touches the server image also starts **Deploy server** ([continuous delivery](deployment.md#continuous-delivery)):

- **Server**: the workflow reruns CI for the commit, builds the image, pushes it to GHCR and, once the `production` environment is approved, tells Dokploy to run that image. The new container waits for Postgres, migrates, then listens. Watch the deployment log in Dokploy; `db.startup` and `server.listening` are the two lines that matter. To deploy by hand: Actions → Deploy server → Run workflow on `main`.
- **PowerSync**: only after a change under `powersync/` has been deployed to the server, redeploy the PowerSync Compose application by hand in Dokploy.
- **Android APK**: push a `v<version>` tag ([Android release](guides/android-release.md)).

The app and the server release independently: installed apps lag the server by days or weeks. That is why migrations and API changes are additive: an old app must work against the new server.

If the container loops on start, a migration failed. The old container is already gone, so the API is down: roll back (below) and read the `db.startup` error.

## Roll back

| Half   | How                                                                                                                                                                                                                                                                                                  |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server | Every image stays in GHCR under its commit SHA. Fastest: Actions → the last good **Deploy server** run → Re-run all jobs (it deploys that commit's image again). Or in Dokploy set the application's image to `ghcr.io/<owner>/<repo>-server:<good sha>` and deploy. Or revert the commit and merge. |
| Native | `eas update:rollback` for the channel, or publish the previous commit with `eas update`. A store build cannot be rolled back; ship a fix.                                                                                                                                                            |

A rollback never undoes migrations. Because migrations are additive, the previous code runs on the newer schema. Only if a migration changed data in a way the old code cannot read, restore a backup first (below).

## Postgres and backups

Postgres is a separate Dokploy database service in the same project, with no external port.

1. Dokploy → **Destinations** → add an S3-compatible destination. For Cloudflare R2: endpoint `https://<account-id>.r2.cloudflarestorage.com`, region `auto`, a **private** bucket used only for backups, and an API token scoped to that bucket (Object Read & Write). Never reuse a public bucket: dumps contain sessions and email addresses.
2. The database service → **Backups** → add a backup: that destination, the application database, schedule `0 3 * * *` (cron, the server's time zone; daily at 03:00), a prefix such as `vermillion/`, keep the latest 14, enabled.
3. Press **Run manual backup** and check that a file appears in the bucket. A schedule that has never produced a file is not a backup.
4. Run the restore drill (below) with that file, and again whenever backups change.

The PowerSync storage database is not backed up: it is rebuilt from the application database ([sync restore checklist](sync-restore-checklist.md)). User media lives in R2, outside these backups.

Backups cover Postgres only. pg-boss keeps its jobs in the `pgboss` schema of the same database, so they are included.

## Restore drill

Proves a backup restores. Needs Docker locally.

1. Download the newest backup from the bucket.
2. `scripts/ops/restore-drill.sh path/to/backup.sql.gz` restores it into a throwaway `postgres:18` container, lists row counts for the core tables (`user`, `session`, `account`, `user_preferences`, `exercise`) and removes the container. It reads gzipped SQL, plain SQL and `pg_dump` custom archives.
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

Change the value in Dokploy's environment for the server application and redeploy.

| Secret                        | Effect                                                                                                                                                                                 |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BETTER_AUTH_SECRET`          | Every session and signed value stops working; everyone signs in again. Database-backed deletion tokens and sign-in codes do not die: revoke them explicitly using the procedure below. |
| `RESEND_API_KEY`              | Takes effect on restart. Queued emails retry with the new key.                                                                                                                         |
| Google / GitHub OAuth secrets | Takes effect on restart.                                                                                                                                                               |
| `DATABASE_URL`                | Change in step with the database service's password.                                                                                                                                   |
| `GHCR_PULL_TOKEN`             | Create a new `read:packages` token, update the GitHub environment secret, run Deploy server (it writes the token into Dokploy), then revoke the old one.                               |
| `DOKPLOY_API_KEY`             | Create a new key in Dokploy, update the GitHub environment secret, delete the old key.                                                                                                 |
| Android release keystore      | Cannot be rotated for installed apps: a new key means a reinstall. Keep the backup. If it must change, add the new fingerprint to `ANDROID_CERT_SHA256` before shipping.               |

GitHub-side secrets (`DOKPLOY_*`, `GHCR_PULL_*`, `ANDROID_UPLOAD_*`) are changed under Settings → Environments → `production` or Settings → Secrets and variables → Actions.

For a compromised auth secret or leaked deletion links or sign-in codes, stop the server before rotation. Revoke database-backed tokens and sessions in Postgres, then deploy with the new secret:

```sql
begin;
delete from verification where identifier like 'sign-in-otp-%' or identifier like 'change-email-otp-%' or identifier like 'delete-account-%';
delete from session;
commit;
```

This deliberately invalidates all outstanding sign-in codes and deletion confirmations and all sessions. Users must request new links. Never paste token values into incident logs. Also remove pending auth-email outbox rows (`delete from auth_email_outbox`) so stale links are not delivered after restart.

## Close sign-ups

Set `REGISTRATION_OPEN=false` on the server application and redeploy. Existing users are unaffected; every unknown address is refused, including yours, so create your own account first. Reopen with `true`.

## Operating on users

There is no admin role or admin UI ([ADR 0033](adr/0033-mobile-first-api-host.md)). Look up, ban or delete a user in Postgres, and to delete one fully use the account deletion flow or run the same purgers (`platform/user-data.ts`) so synced data and outbox rows go too. An admin surface returns with the companion app if it is wanted.

## Scheduled reminders

- Twice a year: compare Cloudflare's IP ranges with `TRUSTED_PROXIES`, Traefik's `forwardedHeaders.trustedIPs` and the firewall allowlist.
- After any change to the backup setup: run the restore drill.
- Monthly: merge Renovate's grouped update PR; oRPC 2 and Drizzle 1.0 are pre-release, so read their release notes first.
