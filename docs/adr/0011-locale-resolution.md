# 0011. Locale resolution and i18n

Status: accepted (2026-11-06).

## Context

Public pages are server-rendered and cacheable; users also want their language to follow their account; emails must match it.

## Decision

i18next on web, native and server, with `en` and `de`, `feature__identifier` keys and the consistency and plural checks (`pnpm i18n:check`, `pnpm i18n:report`). Resolution order: the saved preference, then the locale cookie, then `Accept-Language` (device locale on native), then `en`. The switcher writes the preference and the cookie. URLs carry no locale prefix; a fork may add one to marketing routes only. Emails render in the recipient's saved locale.

## Consequences

- No `hreflang`; one URL per page.
- The cookie lets signed-out visitors keep a language and keeps the server render consistent.
