# 0008. Auth hardening bundle

Status: accepted (2026-11-06).

## Context

The base is a public sign-up surface. Morrow already runs a set of protections in production.

## Decision

Better Auth with email one-time codes instead of passwords ([0029](0029-email-otp-auth-and-account-first-onboarding.md)); Google and GitHub only when their credentials are present. On top:

- Account linking requires a verified local email, so nobody can pre-register an address and take over a provider sign-in.
- No session cookie cache: bans and deletions take effect on the next request.
- Sign-in and verification emails are queued off the request path; a code request does not reveal whether an address is registered; per-endpoint rate limits on email-sending endpoints; security emails state the IP and device.
- The auth secret is checked at startup (length and variety); the server refuses to start without a strong one.
- Turnstile guards sending a sign-in code and social sign-in when `TURNSTILE_SECRET_KEY` is set. The verifier fails closed, checks action and hostname, times out after 10 s and refuses localhost in production. Native renders the widget in a WebView and no client is exempt.
- Disposable email domains (the maintained `disposable-email-domains` package, with parent-domain matching) are rejected when a code is requested and at email change.
- `REGISTRATION_OPEN=false` closes sign-ups; admin emails can still register.
- Admin rights come only from `ADMIN_EMAILS` (verified emails), reconciled at boot and on session creation.
- Account deletion goes through Better Auth's delete-user flow with email confirmation; a before-delete hook removes the user's data across verticals and leftover cleanup runs as jobs.

## Consequences

- Revocation is immediate at the cost of one session lookup per request.
- Admin management is the env var; there is no role-editing UI, no impersonation and no workspace administration.
