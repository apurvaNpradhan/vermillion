# Web, slice 1: rename to Cinnabar, the site, the admin and the closed beta

Status: ready. Decided in the grilling session of 2026-11-17. Amends [ADR 0033](../../adr/0033-mobile-first-api-host.md) (web and admin come back) and [ADR 0034](../../adr/0034-exercise-library.md) (catalog source of truth), and withdraws [ADR 0032](../../adr/0032-passkeys-with-a-dev-tunnel-rp-id.md) until the final domain. Read [verticals](../../../.agents/verticals.md), [orpc](../../../.agents/orpc.md), [orpc-testing](../../../.agents/orpc-testing.md), [auth](../../../.agents/auth.md), [database](../../../.agents/database.md), [environment](../../../.agents/environment.md), [i18n](../../../.agents/i18n.md), [sync](../../../.agents/sync.md), [media](../../../.agents/media.md) and [deploy](../../../.agents/deploy.md) first. The tag `pre-web-removal` holds the earlier web app and admin vertical for reference; it is a reference, not something to revive wholesale.

## Problem Statement

The owner of the app has no way to run it. Adding or correcting a catalog exercise means editing a JSON file and redeploying the server. Looking up, banning or deleting an account means opening the database. There is no public page that says what the app is, no privacy policy, no terms, no account-deletion URL, and no stable link to install the Android build. Anyone who gets the APK can register, because registration is either open to everyone or closed to everyone.

The app is also still called "vermillion", a name with two spellings that is shared by many places and companies, and its bundle id is the scaffold default `com.anonymous.vermillion`. Both must be fixed before the first tester installs a build, because Android treats a new bundle id as a different app.

The owner has only `lostsignal.cloud` for about two months, on Cloudflare's free plan, whose certificate covers one level of subdomain. Passkeys and verified app links are bound to a domain and would all break at the move to the final domain.

## Solution

The app is renamed **Cinnabar**, with a permanent bundle id that does not depend on any domain.

A website is added at `cinnabar.<domain>`. Its public side is a landing page with a request-access form, a privacy policy, terms, an account-deletion page, a support page and a download link. Its private side, under `/admin`, lets the owner sign in and maintain the catalog, the users, the invites and the minimum supported app version. Every admin write is recorded.

The app becomes a closed beta: an account can be created only by an address that holds an accepted invite. The owner approves access requests or invites an address directly; the invite email carries the code and the download link.

Passkeys are removed until the final domain exists. People sign in with an email code or with Google.

## User Stories

### Owner as admin

1. As the owner, I want to sign in to the admin with my email code, so that I use the same account as in the app.
2. As the owner, I want the admin to demand an authenticator-app code as a second step, so that someone who gets into my inbox cannot ban or delete accounts.
3. As the owner, I want to set up the authenticator the first time I open the admin, so that I am never an admin without a second step.
4. As the owner, I want backup codes when I set up the authenticator, so that losing my phone does not lock me out.
5. As the owner, I want admin access granted only to addresses listed in server configuration, so that no database edit or bug can promote a user.
6. As the owner, I want a signed-in user who is not an admin to see a plain "not found" on admin pages, so that the admin's existence leaks nothing.
7. As the owner, I want every admin write recorded with who, what, the target and when, so that I can reconstruct what happened.
8. As the owner, I want to read that record in the admin, filtered by action and target, so that I do not need database access.
9. As the owner, I want an overview page with counts (accounts, pending requests, catalog size, latest release, minimum version), so that I see the state of the app at a glance.

### Catalog

10. As the owner, I want to list catalog exercises with search and filters by muscle group, equipment, type and retired state, so that I can find an entry quickly.
11. As the owner, I want to add a catalog exercise with title, primary and secondary muscle groups, equipment, type, aliases, search terms, instructions and popularity rank, so that gaps are filled without a deploy.
12. As the owner, I want a new catalog exercise to reach every device within seconds, so that I can use it in a plan straight away.
13. As the owner, I want to edit any field of a catalog exercise except its id, so that mistakes get corrected.
14. As the owner, I want the exercise type locked once any set uses the exercise, so that I cannot corrupt logged history.
15. As the owner, I want a clear message when a title is already taken by another catalog exercise, so that I do not create duplicates.
16. As the owner, I want to retire a catalog exercise instead of deleting it, so that history that refers to it still resolves.
17. As the owner, I want to restore a retired catalog exercise, so that a mistaken retirement is undone.
18. As the owner, I want to upload a thumbnail (required for a new exercise) and an optional MP4, so that new entries look like the rest of the catalog.
19. As the owner, I want the form to reject files that are too large or the wrong type before uploading, so that I do not wait on a failed upload.
20. As the owner, I want to preview the thumbnail and video in the edit form, so that I know the right file is attached.
21. As the owner, I want to export the whole catalog as the seed JSON file, so that I can commit a snapshot as a backup and seed new environments.
22. As the owner, I want a server restart never to overwrite or retire an exercise I edited in the admin, so that deploys are safe.
23. As a developer, I want an empty database to be seeded from the committed catalog file, so that a fresh environment works without manual steps.
24. As an app user, I want catalog corrections to appear in my library without updating the app, so that the library improves over time.

### Users

25. As the owner, I want to search accounts by email or name and page through them, so that I can find a tester.
26. As the owner, I want an account view showing sign-up date, last sign-in, sign-in method, app version last seen, ban state and row counts (Programs, Sessions, Custom exercises, media), so that I can help with a support request.
27. As the owner, I want to ban an account with a reason and lift the ban, so that I can stop abuse.
28. As the owner, I want to revoke all of an account's sessions, so that a compromised account is signed out everywhere.
29. As the owner, I want to delete an account through the same deletion path the app uses, so that its rows and media are removed completely.
30. As the owner, I want to be unable to ban or delete my own account from the admin, so that I cannot lock myself out by a slip.
31. As an app user, I want the admin to have no view of my sets, body metrics or photos, so that my training data stays private.

### Invites and access

32. As a visitor, I want to request access with my email address, so that I can join the beta.
33. As a visitor, I want the same confirmation whether or not my address was already known, so that the form does not reveal who has an account.
34. As the owner, I want access requests protected by a CAPTCHA and rate limits, so that the list is not flooded.
35. As the owner, I want to see requests in the states requested, invited, redeemed, expired and revoked, so that I know where everyone stands.
36. As the owner, I want to approve a request with one action that sends the invite email, so that onboarding a tester takes seconds.
37. As the owner, I want to invite an address directly without a request, so that I can bring in people I already know.
38. As the owner, I want to resend an invite (issuing a fresh expiry) and to revoke one, so that I can fix lost emails and withdraw access.
39. As an invited person, I want an email with a download link and a note that my address is now allowed to sign up, so that I know what to do next.
40. As an invited person, I want to sign up in the app with that address by email code or with Google and be let in, so that I do not have to type an invite code.
41. As a person without an invite, I want a clear message that the app is invite-only with a pointer to the request form, so that I know why sign-up failed.
42. As the owner, I want an invite to stop working after 14 days or after it is redeemed, so that old invites cannot be reused.
43. As an existing account holder, I want to keep signing in regardless of invite state, so that the gate only affects new accounts.
44. As the owner, I want a Google sign-up to be checked against the Google account's verified address, so that Google is not a way around the beta.

### Releases and download

45. As a visitor, I want one stable download link on the site that always serves the newest Android build, so that links in old emails keep working.
46. As the owner, I want to set the minimum supported app version in the admin, so that I can retire builds that no longer work with the server.
47. As an app user on a build below the minimum, I want a blocking "update required" screen with a download button, so that I am not left with a broken app.
48. As an app user on an older but supported build, I want a dismissible "update available" notice, so that I learn about new builds without a store.
49. As an app user who is offline, I want the app to keep working from its last known version information, so that a version check never blocks logging a Session.

### Public pages

50. As a visitor, I want a landing page that says in one screen what Cinnabar is, with screenshots, so that I can decide whether to ask for access.
51. As a visitor, I want a privacy policy and terms, so that I know what happens to my data.
52. As a user, I want a page that explains how to delete my account and data, so that I can do it without the app installed.
53. As a user, I want a support page with a contact address, so that I can report a problem.
54. As a visitor, I want the site to set no cookies and run no analytics on public pages, so that there is no consent banner.
55. As a visitor on a phone, I want every public page to read well at phone width, so that the link from an invite email works.

### Sign-in changes

56. As an app user, I want to sign in with an email code or Google, so that sign-in works the same before and after the domain move.
57. As an app user, I want no passkey prompts, settings or onboarding step, so that I am not asked to create something that will stop working.

### Rename

58. As the owner, I want the app, its emails, its notifications and its share cards to say "Cinnabar", so that the product has one name.
59. As the owner, I want every host derived from one domain value, so that moving to the final domain is a configuration change.

## Implementation Decisions

### Order

Work lands in this order, each step as its own conventional commits: (1) rename and host configuration, (2) passkey removal, (3) API: admin foundation, catalog, users, invites, releases, (4) the web app shell and admin screens, (5) public pages, (6) the site deploy workflow, (7) ADRs, guides and docs. Each step leaves lint, typecheck, knip, tests and the i18n check passing.

### Rename and hosts

- The app identity becomes: name `cinnabar`, display name `Cinnabar`, URL scheme `cinnabar`, bundle id `io.github.apurvanpradhan.cinnabar` for Android and iOS, with the EAS slug to match. The EAS project id is kept.
- The repository folder, the `@workspace/*` package scope, the compose project and container names of the running development stack, database names and the text of existing ADRs keep the old name. Renaming the development stack would break a running setup for no user-visible gain.
- User-visible strings (i18n, email templates, notification channel names, share-card wordmark, logger service names) switch to the new name. The `Cinnabar` theme keeps its name.
- `app.config.ts` gains one base domain value and derives the hosts from it: site `cinnabar.<domain>`, API `cinnabar-api.<domain>`, sync `cinnabar-sync.<domain>`, exercise media `media.<domain>`. For now the domain is `lostsignal.cloud`. Derived names that cannot import the config (compose, Dockerfile, EAS profile URLs, workflow variables) are edited by hand, as the deploy guide already requires.
- The EAS production profile and the release workflow's server URL variable point at the API host.

### Passkey removal

- Deleted: the native `passkeys` vertical, the passkey sign-in button, the passkey onboarding step and profile entry, the server passkey plugin and its client plugin, the passkey env values, the `.well-known` routes and their env values, passkey i18n keys, the passkey native dependency and its config plugin. The last commit that has them is tagged `pre-passkey-removal` (local tag; not pushed by the implementer).
- The passkey table stays in the schema (additive-only migrations).
- The auth guide and CONTEXT glossary are updated; ADR 0032 is marked withdrawn until the final domain.

### Admin foundation (API)

- A new `admin` vertical in the API package, reached by other verticals only through its index.
- **Role.** The existing `role` column on the user is reused. A server-only `ADMIN_EMAILS` env value (comma-separated, lower-cased, may be empty) is the single source: on server start and on each sign-in, the role is reconciled so that listed addresses are `admin` and every other account is `user`. Removing an address from the list removes admin on the next sign-in or restart.
- **Second step.** Better Auth's two-factor plugin (TOTP with backup codes) is added. It is offered only inside the admin; ordinary users never see it. Sign-in for an account with two-factor enabled requires the code, as the plugin does by default.
- **Admin procedure builder.** One builder that every admin procedure uses. It requires, in this order: a session, the `admin` role re-read from the database (not trusted from the session cache), the user's address still in `ADMIN_EMAILS`, two-factor enabled on the account, and the account not banned. Failing the role or allowlist check answers `NOT_FOUND`; failing only the two-factor requirement answers a distinct typed error so the site can route to enrolment. The only admin-area procedures outside this builder are the ones needed to enrol two-factor, which still require the role and allowlist.
- **Audit.** An append-only `admin_audit` table: UUIDv7 id, actor user id, action (dotted slug, `CHECK`-free text validated in code against a vocabulary in the shared package), target type, target id, a small typed JSON detail validated by zod per action, IP and user agent, created timestamp. The admin builder exposes a single `audit()` helper; a write procedure that does not call it fails a test (see Testing). The write and its audit row commit in one transaction. No update or delete path exists. `admin.audit.list` pages through it with filters.
- **Overview.** `admin.overview` returns the counts in story 9.
- Rate limits follow the existing per-procedure pattern.

### Catalog (API)

- The database is the source of truth for Reference data in the `exercise` table. The importer becomes a **seed**: it inserts the committed file only when the table holds no catalog rows, and otherwise does nothing. Overwrite, retire-missing, restore-returned and the hash-skip are removed; the `reference_import` table stays but is no longer written. The `--force` flag of the manual import command is removed.
- Admin procedures: list (search, facets, retired filter, paging), get, create, update, retire, restore, export.
- Rules: new ids are UUIDv7 generated on the server; a title is unique among live catalog rows, case-insensitively, enforced by a partial unique index added with a pre-check migration that fails loudly if existing data violates it; slugs are validated against the shared vocabulary; `exercise_type` cannot change once any set references the exercise, checked in the same transaction as the update; rows are never deleted. Custom exercises are never touched by these procedures (every query is scoped to `user_id IS NULL`).
- Text limits match the Custom exercise limits where they exist (title 1–100, instructions up to 2,000) plus limits for aliases and search terms.
- Every write bumps `updated_at` so the existing `exercise_catalog` stream delivers it. No sync configuration changes.
- **Export** returns the catalog in exactly the committed seed file's shape and ordering (sorted by id), so the output can replace the file byte-for-byte after formatting. Retired rows are included with their retired state so a seed reproduces them; the seed format gains an optional retired field for this.
- **Media.** A second set of S3 credentials and bucket settings for the public exercise-media bucket, all in the env package, with development defaults pointing at a new public bucket in the development MinIO. `admin.catalog.mediaUploadUrl` returns a presigned PUT for either the thumbnail or the video of one exercise. Keys are server-chosen and unique per upload (exercise id plus a random suffix), so a replaced file never serves stale from a cache. Limits live in the shared package: thumbnail JPEG or WebP up to 500 KB; video MP4 up to 10 MB; content type and length are signed into the URL. After the upload the client calls update with the new key; the server verifies the object exists with a HEAD before saving the key. A new exercise needs a thumbnail before it can be created as live; it may be created retired without one.

### Users (API)

- Procedures: list (search by email or name, paging, filter by banned), get, ban, unban, revoke sessions, delete.
- The account view returns only: id, email, name, created date, last sign-in date and method, ban state and reason, last seen app version, and row counts per kind. It returns no training rows, body metrics, notes or media URLs.
- Ban and unban use the existing ban columns; a ban also revokes sessions. A banned account is refused at sign-in and by the sync credential endpoint.
- Delete calls the existing account-deletion operation the app uses, so rows, media objects and sync state go the same way.
- An admin cannot ban, delete or revoke the sessions of their own account, and cannot act on another address that is in `ADMIN_EMAILS`.
- **Last seen app version.** The native client sends its app version and build number in a request header on API calls; the server records them on the user row at most once per day. This also feeds the release check.

### Invites (API and auth)

- A new `access` vertical with one table, `access_invite`: UUIDv7 id, email (lower-cased, unique), state (`requested`, `invited`, `redeemed`, `revoked`), a hashed single-use token, invited-at, expires-at, redeemed-at, redeemed-by user id, requested-at, created and updated timestamps. `expired` is derived from `invited` plus a past expiry, not stored.
- **The gate is the address, not a typed code.** A new account may be created only when its verified email has an invite in state `invited` that has not expired. This is enforced in one place, the auth layer's user-creation hook, so it covers the email-code flow and Google alike. On creation the invite becomes `redeemed`. Existing accounts are unaffected. The token exists so the invite email's link can pre-fill and confirm the address on the site; it is not required to sign up.
- This replaces the current closed-registration behaviour. `REGISTRATION_OPEN=true` still means anyone may register (development default); `false` now means invite-only rather than nobody.
- The address check in the email-code request stays anti-enumerating: asking for a code for an uninvited, unknown address behaves like the current closed-registration path does, and the client shows the invite-only message from the registration-status endpoint, which now reports `open`, `invite` or `closed`.
- Public procedure `access.request`: email plus Turnstile token, strict verification, rate limited per IP and per address, always the same answer. A repeat request for a known address changes nothing.
- Admin procedures: list by state with search, approve (requested → invited, sends email), invite directly (creates as invited, sends email), resend (new token, new 14-day expiry, sends email), revoke.
- The invite email is a new template in the email package, sent through the existing queued email path, in English, with the download link and the site link.

### Releases (API and native)

- A small server-side settings table (key, typed JSON value validated by zod per key, updated-at, updated-by) holds `minimum_app_version`. Admin procedures read and set it; the value must be valid semver.
- Public procedure `release.status` returns the minimum supported version and the latest release (version, URL, published date). The latest release comes from the public GitHub Releases API for this repository, fetched by the server and cached in memory for ten minutes, with the last good value kept on failure. The repository owner and name live in `app.config.ts`.
- The native app checks on start and on foreground, at most once per hour, keeps the last answer in its key-value storage, and compares with its own version using a pure function in the shared package. Below minimum: a blocking screen with a download button. Below latest: a dismissible notice, shown once per version. Offline or on any error: the last known answer, and never a block that was not already known.
- The download target is the site's `/download`, which redirects to the newest release's APK asset.

### The web app

- A new app, `apps/web`, TanStack Start. Public routes are prerendered at build time. Everything under `/admin` renders on the client only.
- UI: Tailwind v4, coss ui components copied into the app (it is the only web consumer, so they do not go into a package), the brand tokens from the tokens package, TanStack Table for lists and TanStack Form with the shared zod schemas for edits. Light and dark follow the system.
- Verticals inside the app mirror the API: `admin`, `catalog`, `users`, `access`, `releases`, `auth`, `marketing`, plus `platform`. Components never call oRPC or Query directly; each vertical exposes module hooks, as in the native app. The typed oRPC client comes from the existing client package.
- **Same origin.** The browser only talks to the site's origin. In production the Worker forwards `/rpc/*` and `/api/*` to the API host, preserving method, body, cookies and the client IP header chain the server's resolver expects; in development the dev server proxies the same paths. Cookies stay host-only and `SameSite=Lax`. The site origin is added to the server's trusted origins. The API host itself keeps serving the native app directly.
- **Admin shell.** A sidebar (Overview, Catalog, Users, Access, Releases, Audit), dense tables with search, filters and paging held in the URL, and edit forms in a side sheet. Destructive actions (ban, delete, retire, revoke) ask for confirmation; delete requires typing the account's email.
- **Admin sign-in.** Email code, then the authenticator code. An admin without two-factor is sent to enrolment (QR code, confirm with a code, show backup codes once). A non-admin sees the site's not-found page.
- **Public pages.** Landing (name, one-line pitch, three or four screenshots, request-access form with Turnstile, footer), privacy, terms, account deletion, support, and `/download` (a redirect to the newest APK, resolved by the Worker from the same cached release lookup; if no release exists it shows a short page saying so). The landing page uses the app's graphite base and cinnabar-red accent. Legal text is real, plain-language first-draft copy that matches what the app does, marked as a draft for the owner to review; it is not placeholder text.
- All user-visible strings go through i18n in English, in a web namespace of the i18n package.
- No analytics, no cookies on public pages. Turnstile is loaded only where the request form is.
- Environment: public values (site URL, Turnstile site key) and Worker bindings are declared in the env package with a web entry; nothing reads `import.meta.env` directly.

### Deploy

- The site deploys to a Cloudflare Worker with static assets, with a `wrangler` config checked in and the custom domain `cinnabar.<domain>`.
- A `deploy-web` workflow mirrors the server deploy workflow: runs only after CI succeeds for the commit on `main` (and on manual dispatch), path-filtered to what affects the site, uses the `production` environment, pinned actions, least-privilege permissions, and fails clearly when the Cloudflare token or account id secret is missing. It passes `zizmor`.
- CI gains the web app's lint, typecheck and build.
- The deployment guide gains: DNS records for the four hosts, the Worker's custom domain, Turnstile keys, `ADMIN_EMAILS`, the exercise-media bucket credentials and CORS for presigned uploads from the site origin, the Google OAuth redirect URI on the API host, and a "moving to the final domain" checklist.
- GitHub sign-in is left unconfigured in production; Google is configured. No code change is needed for that beyond the docs.

### Documentation

- A new ADR records: the site and admin returning (amending 0033), the catalog's source of truth moving to the database (amending 0034), invite-only registration, TOTP for admins, passkeys and verified app links withdrawn until the final domain, and the rename.
- The agent guides (auth, deploy, environment, verticals layout, a new short `web` guide) and CONTEXT.md gain the new terms: Admin, Invite, Access request, Minimum supported version, Seed.
- `docs/privacy-readiness.md` is updated for the admin's account view and the audit record.

## Testing Decisions

A good test here exercises behaviour through a public interface and would survive a rewrite of the internals: a procedure called through the router with a real database, or a pure function called with values. Tests do not mock our own modules; only the network boundary is faked (Turnstile verification, the GitHub Releases fetch, S3).

- **Seam 1 (router in-process on cloned Docker Postgres) is the main seam** and covers every new procedure. Prior art: the existing procedure tests for the media and exercise verticals.
  - Authorization matrix, generated from the router: every procedure under the admin namespace is called as anonymous, as a normal user, as an allow-listed admin without two-factor, as an admin whose address was removed from the allowlist, and as a full admin. Only the last succeeds. The test enumerates the router, so a new admin procedure is covered without anyone remembering to add a case.
  - Audit: every admin mutation leaves exactly one audit row with the right actor, action and target; a failed mutation leaves none.
  - Catalog: create, update, title uniqueness, slug validation, type lock once a set exists, retire and restore, Custom exercises untouched, export round-trips through the seed.
  - Seed: seeds an empty table; does nothing when catalog rows exist, including after an admin edit.
  - Users: account view contains no training fields; ban blocks sign-in and sync credentials; self-action and admin-on-admin refused; delete removes the account's rows.
  - Access: request is idempotent and uniform in its answer, rate limited, and refuses a bad Turnstile token; approve, direct invite, resend and revoke transitions; sign-up allowed only with a live invite, by email code and by a Google-shaped account creation; expiry; existing accounts unaffected; redeemed state set once.
  - Releases: minimum version validation; `release.status` with a faked releases fetch, including the stale-on-failure path.
- **Unit tests** for pure logic in the shared package: version comparison and the update decision (none, available, required), invite state derivation, media limits, the audit action vocabulary. Prior art: the existing shared unit tests.
- **Web app.** No browser e2e suite, in line with ADR 0026. Unit tests cover the Worker's forwarding decision (which paths go to the API, which headers are passed) as a pure function, and the admin route guard's decision. The build runs in CI so a broken prerender fails the pipeline.
- **Native.** Unit tests for the update-check decision and its storage of the last answer; the existing auth flow tests are updated for the removed passkey branch and the invite-only message.
- The rename is verified by the full check suite and a search that finds no user-visible "vermillion" outside the deliberately kept places.

## Out of Scope

- Templates (Programs published as Reference data) and any web Program editor.
- A tool to promote a Custom exercise into the catalog and repoint the rows that use it. The seven entries in `docs/catalog-gaps.md` are added by hand afterwards.
- Finer admin roles, impersonation, and any admin view of training data, body metrics or photos.
- A user-facing companion web app and web sign-up. The site signs in admins only.
- Passkeys, verified app links and share-link pages, until the final domain.
- A staging environment, analytics, a blog, pricing or docs pages.
- Video transcoding or thumbnail generation.
- iOS distribution. The download link serves the Android build; TestFlight is handled when an Apple account exists.
- Catalog translations.
- Pushing, opening pull requests, creating DNS records, Cloudflare resources, OAuth clients or secrets. Those are the owner's steps, listed in the deployment guide.

## Further Notes

- Moving to the final domain later needs: the base domain value, DNS, the Worker's custom domain, the OAuth redirect URI, the media bucket's custom domain and CORS, the EAS profile and workflow URLs, and a new app build. No data migration.
- The owner must do once: create the Cloudflare API token and account id secrets, the Turnstile widget, the Google OAuth client, the public exercise-media bucket credentials, and set `ADMIN_EMAILS`.
- The committed catalog file stays in the repository as the seed. After meaningful catalog edits the owner exports and commits it; nothing enforces that.
- The first catalog task after this ships is adding the seven missing exercises and repointing the owner's own plan rows.
