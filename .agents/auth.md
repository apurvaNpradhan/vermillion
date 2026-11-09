# Auth

Better Auth, configured in `packages/api/src/auth` with helpers in `packages/auth`. Load the `better-auth-best-practices` and `better-auth-security-best-practices` skills before changing it.

## What is on

Email one-time codes only, no passwords ([ADR 0029](../docs/adr/0029-email-otp-auth-and-account-first-onboarding.md)); Google and GitHub only when both credentials are set; the Expo plugin for native; passkeys (`@better-auth/passkey`, same version as `better-auth`; [ADR 0032](../docs/adr/0032-passkeys-with-a-dev-tunnel-rp-id.md)); delete-user with email confirmation; `lastLoginMethod`; the `jwt` plugin (5-minute PowerSync tokens only, JWKS at `/api/auth/jwks`; [ADR 0017](../docs/adr/0017-sync-credentials-and-transport.md)); the `openAPI` plugin (schema only, never in production, shown in `/api/reference`).

## Invariants (do not weaken)

- Account linking requires a verified local email.
- No session cookie cache: bans and deletions apply on the next request.
- Auth emails are queued as jobs, not sent on the request path.
- Requesting a sign-in code answers the same for an existing and a new address; the account is created, verified, when the first code is redeemed. (With `REGISTRATION_OPEN=false` an unknown address is refused up front.)
- Codes are 6 digits, expire in 5 minutes, are stored hashed, burn after 3 wrong guesses, and a resend rotates the code. Constants live in `@workspace/shared` (`OTP_*`); the email copy and the clients read them.
- Only the `sign-in` code type can be requested; the plugin's verify-email, check and password-reset endpoints answer 404.
- Email-sending and auth endpoints have their own stricter rate limits.
- Turnstile (when `TURNSTILE_SECRET_KEY` is set) guards sending a code and social sign-in; the verifier fails closed and checks action and hostname. No client is exempt, native included.
- Disposable domains are rejected when a code is requested and at email change.
- `REGISTRATION_OPEN=false` refuses every unknown address; existing accounts still sign in. There is no admin role or admin plugin ([ADR 0033](../docs/adr/0033-mobile-first-api-host.md)); the `role` and ban columns remain in the schema unused.
- The server refuses to start without a strong `BETTER_AUTH_SECRET`.
- Cookies are host-only, `SameSite=Lax`; the trusted-origin middleware rejects foreign-origin browser requests.

## Account deletion

Goes through Better Auth's delete-user flow. Native email links open `confirm-deletion` with the token and redeem it through the authenticated account hook; they never depend on browser cookies. Sensitive email content lives in `auth_email_outbox` with a user cascade and is removed after successful/final delivery or expiry; pg-boss receives only its ID. A before-delete hook calls the purgers registered in `platform/user-data.ts`; leftovers go to the account cleanup queue, which calls them again until they all succeed, so purgers must be idempotent. A vertical whose rows do not cascade from the user registers a purger there.

## Email kinds and codes

`sign-in-code`, `change-email-code`, `delete-account`, `security-notice`, `sign-in-notice` (`packages/auth/src/email-jobs.ts`). Codes follow the same outbox rules as links: sensitive content in `auth_email_outbox` until delivered, pg-boss gets only the ID, and nothing logs a code or a subject (the subject starts with the code). Change email sends the code to the new address and a `security-notice` to the old one.

## Onboarding

Account first, derived from the profile: `pendingOnboardingSteps` in `@workspace/shared` returns the required steps whose data is missing (today: `name`). No stored flag. Native guards onboarding in its session state. The name is saved with `authClient.updateUser({ name })`.

## Client side

`@workspace/client/auth-client` (with `emailOTPClient()`) is shared by every client: `authClient.emailOtp.sendVerificationOtp({ email, type: "sign-in" })`, `authClient.signIn.emailOtp({ email, otp, name? })`, `authClient.emailOtp.requestEmailChange({ newEmail })` then `authClient.emailOtp.changeEmail({ newEmail, otp })`. Auth screens live in `apps/native/src/auth`, onboarding in `apps/native/src/onboarding`.

## Passkeys

Sign-in only for existing accounts; registration needs a fresh session. RP ID = `AUTH_RP_ID`, default the hostname of `APP_URL` (`api.<domain>`; permanent: never change it once passkeys exist); the accepted origins are exactly `AUTH_PASSKEY_ORIGINS` plus the `android:apk-key-hash:` origin of every `ANDROID_CERT_SHA256` fingerprint, resolved in `apps/server/src/index.ts`. HTTPS origins from that list are also trusted origins. `/.well-known/assetlinks.json` and `apple-app-site-association` are served by the API (`platform/well-known.ts`) from `ANDROID_CERT_SHA256` / `APPLE_TEAM_ID`, 404 while unset. Phone testing needs the dev tunnel: see `docs/guides/native-dev.md`. Endpoints (under `/api/auth`): `GET /passkey/generate-register-options`, `POST /passkey/verify-registration`, `GET /passkey/generate-authenticate-options`, `POST /passkey/verify-authentication`, `GET /passkey/list-user-passkeys`, `POST /passkey/delete-passkey`, `POST /passkey/update-passkey`. The challenge travels in a signed cookie, so a native client must send back the cookies of the options response.
