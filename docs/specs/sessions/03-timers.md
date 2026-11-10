# Sessions, slice 3: rest, timers, awake and haptics

Status: ready after slice 2. Decisions: [ADR 0038](../../adr/0038-sessions.md) (Rest and timers). Load the Expo skills before adding native modules.

## Goal

Rest and duration timers are correct across backgrounding, killing and resuming the app. A notification arrives when rest ends even if the app is not running.

## Work

- **Dependencies**: `expo-notifications` and `expo-keep-awake`, with a dev-client rebuild, recorded in [native development](../../guides/native-dev.md). Create an Android notification channel "Rest timer" with high importance and vibration.
- **Rest**:
  - `tickSet` triggers `startRest` with the exercise's rest, or `WARMUP_REST_SECONDS` after a warm-up. In a superset, rest starts only after the last member's set of the round. None when rest is off.
  - A new tick replaces the running rest. Unticking `rest_set_id` clears it.
  - Bottom bar: countdown, −15, +15 (bounded 0–10 min), Skip and a progress line. When it reaches 0 the bar plays the end haptic and disappears.
- **Notification service** (`apps/native/src/session/rest-notification.ts`): `schedule(endsAt)`, `reschedule`, `cancel`, keyed by Session id so a stale one is always replaced. When the app opens, it reconciles the schedule against the stored `rest_ends_at`. If another device takes the Session over, its rest notification is cancelled here.
- **Permission**: before the first rest, a one-line sheet ("Get a buzz when rest is over") then the OS request. Remember that it was asked. Settings → Training gets a "Rest notifications" row showing the status, which deep-links to the OS settings when denied.
- **Duration sets**: inline play. With a target it counts down and auto-ticks at 0 with a haptic; without one it is a stopwatch and Stop ticks. `timer_started_at` persists, so the elapsed time is recomputed on foreground. Typing a value cancels the timer.
- **Keep awake**: active while the session screen is focused and the `keepAwake` preference is on. The toggle is in Settings → Training.
- **Haptics**: light on tick, notification-success at the end of rest, success on a Record (the Record check uses slice 1's `recordFlags`).

## Tests

- Unit: rest start, replacement and cancel rules, superset rest timing, and the remaining time computed from timestamps under clock jumps.
- Manual: rest with the app backgrounded, killed and the screen locked (the notification fires once, at the right time); +15 then Skip cancels the notification; permission denied still shows the bar; a duration countdown survives backgrounding.

## Done

The standard checks pass and the manual checks are recorded.
