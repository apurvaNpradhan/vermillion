# Sentry (crash reporting and feedback)

Hosted Sentry, free tier, two projects: one for the native app, one for the API. Both are **off
until a DSN is set**: without one the app and the server run exactly as before, and Send feedback
falls back to an email to `appConfig.supportEmail`.

## Set up once

1. Create a Sentry organization at sentry.io (note its slug and region).
2. Create two projects: platform **React Native** (native app) and **Node.js** (API). Each has a
   DSN under _Settings → Client Keys_.
3. Create an organization auth token (_Settings → Auth Tokens_, scopes `project:releases`,
   `org:read`) for source maps. It is a secret; never an `EXPO_PUBLIC_` value.
4. Turn off in each project (_Settings → Security & Privacy_): "Store IP addresses" and, to be
   safe, "Prevent storing of IP addresses".

## Where each value goes

| Value                     | Name                     | Where                                                                  |
| ------------------------- | ------------------------ | ---------------------------------------------------------------------- |
| Native DSN                | `EXPO_PUBLIC_SENTRY_DSN` | GitHub repository **variable** (Android release); EAS `production` env |
| Org slug                  | `SENTRY_ORG`             | GitHub variable; EAS env                                               |
| Native project slug       | `SENTRY_PROJECT`         | GitHub variable; EAS env                                               |
| Auth token                | `SENTRY_AUTH_TOKEN`      | GitHub **secret**; EAS secret                                          |
| Server DSN                | `SENTRY_DSN`             | Dokploy application environment                                        |
| Server release (optional) | `SENTRY_RELEASE`         | Set by the image build to the commit; defaults to the version          |

For a local run, copy the DSNs into `apps/native/.env` and `apps/server/.env`. Organizations in the
EU region also set `SENTRY_URL=https://de.sentry.io` for the build.

## Source maps

- **Android release workflow:** the Expo config plugin (`@sentry/react-native/expo` in
  `apps/native/app.config.ts`) wires the upload into the release Gradle build when
  `SENTRY_AUTH_TOKEN` is present, and `getSentryExpoConfig` in `metro.config.js` adds debug ids to
  the bundle. Without the token the upload is turned off; the build does not fail. Events map to
  the build through the release `<package>@<version>+<build>` and dist (the build number) the SDK
  reads from the binary.
- **EAS builds:** set the same variables in the EAS environment; the plugin does the rest.
- **EAS Update (OTA):** the bundle has no native build, so upload its maps after exporting:

  ```sh
  cd apps/native
  npx expo export --platform android --platform ios
  SENTRY_AUTH_TOKEN=… SENTRY_ORG=… SENTRY_PROJECT=… npx sentry-expo-upload-sourcemaps dist
  eas update --channel production --environment production --message "…"
  ```

  There is no OTA workflow in this repository yet; if one is added, run the upload step there.

## What is sent

Native app (only while "Send crash reports" in Settings is on, the default; a per-device choice):

- JavaScript errors and native crashes: stack traces, error messages with email addresses
  replaced, device model and OS version, app version and build, `development`/`production`.
- Breadcrumbs (taps are not recorded): navigation routes and request URLs **without query strings
  or tokens**, console lines with email addresses replaced.
- One anonymous id: a random id made on the device. It is not the account id and never an email.

Never sent: IP address, account id, email, cookies, request bodies, screenshots, view hierarchy,
session replays, performance traces, workout or body data.

Feedback (Settings → Send feedback) is sent when the person submits it, even with crash reports
off. It carries their message, the device and app version, and their account email only if they
switch on "Include my email so you can reply".

API: unexpected errors and typed errors that answer 5xx. Expected 4xx failures are not reported.
Events carry the stack, the request method and path (no query string, body, headers or cookies),
messages with emails replaced, and the internal user id. No breadcrumbs, no traces.

## Operating notes

- Free-tier quotas are per organization; tracing is off, so only errors count.
- Turning "Send crash reports" off restarts the SDK with native crash handling off and drops every
  JavaScript event.
- Code: `apps/native/src/platform/crash-reporting/` (client, opt-out gate, anonymous id, scrubbing),
  `packages/api/src/platform/error-reporting.ts`, shared helpers in
  `packages/shared/src/telemetry-scrub.ts`.
