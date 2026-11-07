# Auth

Better Auth, configured in `packages/api/src/auth` with helpers in `packages/auth`. Load the `better-auth-best-practices` and `better-auth-security-best-practices` skills before changing it.

## What is on

Email and password with verification and reset; Google and GitHub only when both credentials are set; the Expo plugin for native; the admin plugin; delete-user with email confirmation; `lastLoginMethod`; the `openAPI` plugin (schema only, never in production, shown in `/api/reference`).

## Invariants (do not weaken)

- Account linking requires a verified local email.
- No session cookie cache: bans and deletions apply on the next request.
- Auth emails are queued as jobs, not sent on the request path.
- Sign-up for an existing address returns the same neutral response as a new one.
- Email-sending and auth endpoints have their own stricter rate limits.
- Turnstile (when `TURNSTILE_SECRET_KEY` is set) guards sign-up, sign-in and reset; the verifier fails closed and checks action and hostname. No client is exempt, native included.
- Disposable domains are rejected at sign-up and email change.
- `REGISTRATION_OPEN=false` blocks sign-up except for `ADMIN_EMAILS`.
- Admin = verified email in `ADMIN_EMAILS`, reconciled at boot and on session creation. No other source.
- The server refuses to start without a strong `BETTER_AUTH_SECRET`.
- Cookies are host-only, `SameSite=Lax`; the trusted-origin middleware rejects foreign-origin browser requests.

## Account deletion

Goes through Better Auth's delete-user flow. Native email links open `confirm-deletion` with the token and redeem it through the authenticated account hook; they never depend on browser cookies. Sensitive email content lives in `auth_email_outbox` with a user cascade and is removed after successful/final delivery or expiry; pg-boss receives only its ID. A before-delete hook calls the purgers registered in `platform/user-data.ts`; leftovers go to the account cleanup queue, which calls them again until they all succeed, so purgers must be idempotent. A vertical whose rows do not cascade from the user registers a purger there.

## Client side

`@workspace/client/auth-client` is shared by web and native. Auth screens live in `apps/*/src/auth`.
