# Body, slice 4: reminders

Status: ready after body slice 2. Decisions: [ADR 0041](../../adr/0041-body-metrics.md).

## Goal

Optional, local reminders that open the right sheet.

## Work

- `ui` preferences: `weighInReminder: { enabled, time }` and `checkInReminder: { enabled, weekday, time }`, both off by default.
- Settings → Body: two rows with time (and weekday) pickers. Turning one on asks notification permission with the existing explanation pattern.
- Scheduling with `expo-notifications` repeating triggers on a dedicated Android channel `body-reminders`; rescheduled whenever the preference changes or the app starts (reconcile, like the rest reconciler), cancelled when off or on sign-out.
- Tapping opens the weight quick-log sheet or the Check-in sheet (deep link through the existing notification response handling). Reminders are plain repeating requests at the phone's wall-clock time and always fire (amended 2026-11-15: skipping a logged day needed dated requests that expired after 48 weeks, broke on travel and used most of iOS's 64 pending slots).
- i18n for notification text.

## Tests

- Unit: the reconcile function (desired vs scheduled → actions), next-fire computation.

## Done when

Checks pass; on device both reminders fire and open the right sheet.
