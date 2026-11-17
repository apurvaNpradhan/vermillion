# Auth

Better Auth, configured in `packages/api/src/auth` with helpers in `packages/auth`. Load the `better-auth-best-practices` and `better-auth-security-best-practices` skills before changing it.

## What is on

Email one-time codes only, no passwords ([ADR 0029](../docs/adr/0029-email-otp-auth-and-account-first-onboarding.md)); Google and GitHub only when both credentials are set (production configures Google only); the Expo plugin for native; delete-user with email confirmation; `lastLoginMethod` (stored on the user, for the admin's account view); two-factor (TOTP and backup codes) for admins only; the `jwt` plugin (5-minute PowerSync tokens only, JWKS at `/api/auth/jwks`; [ADR 0017](../docs/adr/0017-sync-credentials-and-transport.md)); the `openAPI` plugin (schema only, never in production, shown in `/api/reference`).

## Invariants (do not weaken)

- Account linking requires a verified local email.
- No session cookie cache: bans and deletions apply on the next request.
- Auth emails are queued as jobs, not sent on the request path.
- Requesting a sign-in code answers the same for an existing and a new address; the account is created, verified, when the first code is redeemed. (With `REGISTRATION_OPEN=false` an unknown address without a live invite is refused up front with `REGISTRATION_CLOSED`; clients show the invite-only message from `auth.registrationStatus`, whose `mode` is `open` or `invite`.)
- Codes are 6 digits, expire in 5 minutes, are stored hashed, burn after 3 wrong guesses, and a resend rotates the code. Constants live in `@workspace/shared` (`OTP_*`); the email copy and the clients read them.
- Only the `sign-in` code type can be requested; the plugin's verify-email, check and password-reset endpoints answer 404.
- Email-sending and auth endpoints have their own stricter rate limits.
- Turnstile (when `TURNSTILE_SECRET_KEY` is set) guards sending a code, social sign-in and access requests; the verifier fails closed and checks the action and that the hostname is the API's or the site's. No client is exempt, native included.
- Disposable domains are rejected when a code is requested and at email change.
- **Closed beta.** With `REGISTRATION_OPEN=false` a new account needs a live invite for its verified address (or the address in `ADMIN_EMAILS`). One check, in the `user.create.before` hook, covers email codes and Google; `after` redeems the invite. Existing accounts are unaffected.
- **Admins** are `ADMIN_EMAILS` only: the `role` column is reconciled on start and every sign-in (`session.create.before`). There is no Better Auth admin plugin. Admin procedures use the `admin` builder in `packages/api/src/admin` (role re-read from the database, allowlist, two-factor enrolled and passed on this session).
- **Two-factor.** Only allow-listed admins with a session reach `/two-factor/enable`, `/verify-totp` and `/verify-backup-code`; every other two-factor endpoint answers 404 (so a stolen inbox cannot disable or reissue it). Passing the step sets `session.two_factor_verified_at`. Email-code sign-in is never gated, so the owner's app is unaffected.
- **Bans** (`user.banned`, set by the admin) end every session; `session.create.before` refuses a new one (`BANNED_USER`) and `sync.credentials` mints no token.
- The server refuses to start without a strong `BETTER_AUTH_SECRET`.
- Cookies are host-only, `SameSite=Lax`; the trusted-origin middleware rejects foreign-origin browser requests. The site's origin is trusted: its Worker forwards `/api/auth` with the browser's cookies.

## Account deletion

Goes through Better Auth's delete-user flow. Native email links open `confirm-deletion` with the token and redeem it through the authenticated account hook; they never depend on browser cookies. Sensitive email content lives in `auth_email_outbox` with a user cascade and is removed after successful/final delivery or expiry; pg-boss receives only its ID. A before-delete hook calls the purgers registered in `platform/user-data.ts`; leftovers go to the account cleanup queue, which calls them again until they all succeed, so purgers must be idempotent. A vertical whose rows do not cascade from the user registers a purger there.

## Email kinds and codes

`sign-in-code`, `change-email-code`, `delete-account`, `security-notice`, `sign-in-notice`, `invite` (`packages/auth/src/email-jobs.ts`). Codes follow the same outbox rules as links: sensitive content in `auth_email_outbox` until delivered, pg-boss gets only the ID, and nothing logs a code or a subject (the subject starts with the code). Change email sends the code to the new address and a `security-notice` to the old one.

## Onboarding

Account first, derived from the profile: `pendingOnboardingSteps` in `@workspace/shared` returns the required steps whose data is missing (today: `name`). No stored flag. Native guards onboarding in its session state. The name is saved with `authClient.updateUser({ name })`.

## Client side

`@workspace/client/auth-client` (with `emailOTPClient()`) is shared by every client: `authClient.emailOtp.sendVerificationOtp({ email, type: "sign-in" })`, `authClient.signIn.emailOtp({ email, otp, name? })`, `authClient.emailOtp.requestEmailChange({ newEmail })` then `authClient.emailOtp.changeEmail({ newEmail, otp })`. Auth screens live in `apps/native/src/auth`, onboarding in `apps/native/src/onboarding`.

## Passkeys

Withdrawn until the final domain ([ADR 0046](../docs/adr/0046-site-admin-closed-beta-and-rename.md)); the code is at tag `pre-passkey-removal`. The `passkey` table stays in the schema.

Sign-in sessions explicitly expire after 30 days and refresh after one day of use. Sensitive
operations retain a one-day freshness window; longer sign-in persistence does not extend it.
