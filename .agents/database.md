# Database

Postgres with Drizzle (1.0 RC, pinned). `packages/db` holds the connection, the migration runner, column helpers and Better Auth's generated tables. App tables live in verticals (`<vertical>/tables.ts`); `drizzle.config.ts` collects them.

## Tables

Every app table uses the column helpers from `@workspace/db`: a UUIDv7 `id` generatable on the client, and UTC `created_at` / `updated_at`. This keeps rows syncable for local-first forks. User-owned rows reference the user with `onDelete: "cascade"`, so account deletion removes them; anything outside Postgres is cleaned by a job.

## Migrations

```sh
pnpm db:generate   # after changing a tables.ts; commit the SQL
pnpm db:migrate    # apply locally (the server also migrates on start)
```

The server waits for Postgres, migrates, then listens. Migrations must be additive-only:

- Add tables and nullable or defaulted columns freely.
- Never drop, rename or retype in the same release that stops using the column. Stop using it, ship, then remove it in a later release.
- Never rewrite data in a way the previous release cannot read.

Reason: the old container and the old Worker run against the new schema during a deploy, and rollback does not undo migrations. See ADR 0007.

## Access

Operations take the `db` and ids and return plain data. Scope every query to `userId` for owned data. Do not log connection strings; startup logging strips passwords.
