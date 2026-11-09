# 0011. Locale resolution and i18n

Status: accepted (2026-11-06).

## Context

Public pages are server-rendered and cacheable; users also want their language to follow their account; emails must match it.

## Decision

i18next on web, native and server, with `en` and `de`, `feature__identifier` keys and the consistency and plural checks (`pnpm i18n:check`, `pnpm i18n:report`). Resolution order: the saved preference, then the locale cookie, then `Accept-Language` (device locale on native), then `en`. The switcher writes the preference and the cookie. URLs carry no locale prefix; a fork may add one to marketing routes only. Emails render in the recipient's saved locale.

## Amendment: English-only initial release

Only `en` is currently supported. Other languages, including German, are deferred. Keep the i18n infrastructure and resolution order so languages can be added later, but fall back to English for unsupported saved preferences, cookies and device languages. Hide the native language picker until more than one locale is supported. New translation keys only require English for now.

## Consequences

- No `hreflang`; one URL per page.
- The cookie lets signed-out visitors keep a language and keeps the server render consistent.
