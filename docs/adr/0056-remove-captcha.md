# 0056. Remove the CAPTCHA (Cloudflare Turnstile)

Status: accepted, 2026-11-22. Supersedes the Turnstile decisions in
[ADR 0008](0008-auth-hardening.md) and [ADR 0029](0029-email-otp-auth-and-account-first-onboarding.md).

## Context

Turnstile ran in a WebView on the sign-in screens. When `TURNSTILE_SECRET_KEY` was set the server
refused every code request, social sign-in and access request without a token, native included. In
a closed beta behind an invite list it cost a WebView dependency, a slow first screen and a
failure mode a real person could hit (the widget not loading), for little protection: an address
that is not invited is already refused before any code is sent.

## Decision

- Delete the verifier, the Better Auth hook, the `access.request` token field, the native widget
  and the `react-native-webview` dependency, `TURNSTILE_SECRET_KEY` and
  `EXPO_PUBLIC_TURNSTILE_SITE_KEY`, the `CAPTCHA_FAILED` error and its message.
- Keep, and add to, the protections that do not need a person to prove anything:
  - Stricter Better Auth limits on sending codes (3 a minute per IP), redeeming them, changing
    email, deleting an account and social sign-in.
  - **New:** at most 5 code requests per address in 10 minutes (`send-code-limit.ts`), counted in
    process memory like the other limits, so one inbox cannot be flooded from many origins.
  - Access requests: limited per IP and per address, always the same answer.
  - Disposable-domain rejection when a code is requested and at email change.
  - Invite-only registration (`REGISTRATION_OPEN=false`): an unknown address without a live
    invite is refused before a code is sent. Codes are 6 digits, expire in 5 minutes, burn after
    3 wrong guesses.
- Bump the native stack revision (a native dependency left).

## Consequences

- If the closed beta opens to everyone and abuse appears, add a challenge back as its own
  decision (a proof-of-work or a provider with a native SDK), not a WebView.
- Limits live in process memory: per instance, reset on restart. Acceptable for one API instance.
- The Turnstile widget in Cloudflare and its two variables can be deleted. The public site's
  privacy text must stop naming Turnstile (apps/web is changed separately).
