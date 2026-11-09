# 0029. Email-code sign-in, account-first onboarding, squashed baseline

Status: accepted (2026-11-08).

## Context

Sign-in was email and password with a verification link, a reset link and an "existing account" notice. That is five emails and four screens before anyone reaches the app, a password the person must invent and remember, and a sign-up form that asks for a name, an email and a password at once. The app is phone-first and mostly used from a lock screen: a code that arrives as a notification is faster than a link that opens a browser. Nothing is deployed, so the schema and the flows can change without migration cost.

## Decision

- **Email code only.** Better Auth's `emailOTP` plugin replaces `emailAndPassword`. Google and GitHub stay. There is no password anywhere: no hashing, no reset, no policy. Codes are 6 digits, valid for 5 minutes (`OTP_EXPIRY_SECONDS` in `@workspace/shared`, which the email copy also reads), stored hashed, 3 wrong guesses burn the code, and a resend rotates (issues a fresh code and retires the old one).
- **One path for new and returning people.** The client always asks for a `sign-in` code and redeems it with `signIn.emailOtp`; the account is created, with the email verified, when the first code is redeemed. A code request therefore answers the same for every address, and the only difference is whether the mailbox is an existing account's. Exception: while `REGISTRATION_OPEN=false` an unknown address is refused at the request instead of being sent a code that could never be redeemed, which reveals that the address has no account (and only then).
- **Guards run before a code is sent.** `/email-otp/send-verification-otp` is where Turnstile and the disposable-address check run, and it accepts only the `sign-in` type. The unused plugin endpoints (verify-email, check, the password-reset ones) answer 404. Rate limits: sending a code 3 per 60 s per client, redeeming 10 per 60 s, and the change-email endpoints 3 per 60 s.
- **Change email** uses the plugin's change-email flow: the code goes to the new address, the current session is the proof of the old one (`verifyCurrentEmail` is off), and the old address gets a `security-notice` afterwards. Account deletion keeps its confirmation link.
- **Email kinds** are exactly `sign-in-code`, `change-email-code`, `delete-account`, `security-notice` and `sign-in-notice`. Codes are as sensitive as links: they live in the outbox row only until delivered, never in the pg-boss payload or the structured log. A sign-in code for an address with no account has no user row, so `auth_email_outbox.user_id` is nullable for it. The first sign-in of a new account sends no `sign-in-notice`.
- **Account first, onboarding derived.** After the account exists, the person answers the questions the product needs, one per screen. `@workspace/shared` holds a registry of steps (`id`, `required`, `isComplete(profile)`) and a pure `pendingOnboardingSteps(profile)`. There is no stored "onboarded" flag: a step is pending exactly while its data is missing, so adding a step later catches existing accounts too. Today there is one step, `name` (the code sign-up cannot ask for it, and social providers usually supply it). Web redirects to `/onboarding` after sign-in and from the `_app` guard; native does the same from its session guards. The name is saved with Better Auth's `updateUser`.
- **Baseline squash.** Nothing is in production, so the five migrations were replaced by one baseline generated from the current schema, with the `powersync` publication and grant from the notes migration appended (it cannot be generated). Better Auth's `account.password` column stays because the plugin's schema expects it, though nothing writes it. Migration names are not referenced by sync bootstrap or the replication setup ([0023](0023-replication-setup.md)), so nothing else changed. Additive-only rules ([0007](0007-additive-migrations.md)) apply again from this baseline.

## Consequences

- A person without access to their mailbox cannot sign in; there is no password fallback. Email deliverability is now part of availability, and the runbook's "close sign-ups" and secret-rotation steps no longer mention reset tokens.
- Tests and e2e sign in by reading the code from the `[email]` log marker line (the subject starts with the code) or the harness outbox.
- A forgotten-account address is free to be registered again after deletion; signing in with it starts an empty account.
- Native and web share `createAppAuthClient`, which now includes `emailOTPClient()`.
