# 0010. Preferences live in their own table

Status: accepted (2026-11-06).

## Context

Morrow stores locale and time zone on the `user` table. In this template that couples app settings to Better Auth's generated tables, which forks regenerate.

## Decision

`user_preferences` has one row per user, created on first write: typed `locale` and `timezone` columns, a `ui` jsonb validated by a shared zod schema with defaults, and `updated_at`. A missing row means all defaults. The preferences vertical exposes get and update procedures and clients use one preferences hook. Theme is per device (cookie on web, device storage on native) and never stored in the database.

## Consequences

- Code ported from morrow must be rewired from `user.locale` to this table.
- A preferences read before the first write costs no row.
