# Media, slice 1: foundation and Program covers

Status: ready. Decisions: [ADR 0040](../../adr/0040-user-media.md). Read [sync](../../../.agents/sync.md), [database](../../../.agents/database.md), [orpc](../../../.agents/orpc.md), [orpc-testing](../../../.agents/orpc-testing.md), [environment](../../../.agents/environment.md), [adding a synced table](../../guides/adding-a-synced-table.md) and the `powersync` skill (attachments section) first. New vertical: `media` (api, sync, native).

## Goal

A user picks a Program cover on one device; it shows at once, uploads to the private bucket, and appears on their other device. Deleting it removes the objects within a day. Account deletion removes every object. The local-only cover path is gone.

## Work

### Infrastructure

- `docker-compose.yml`: a `minio` service, a pinned final MinIO image **by digest**, on `127.0.0.1:9000`, with a one-shot `minio-init` that creates the dev bucket `vermillion-user-media` (private) and its CORS-free policy. `pnpm db:start` brings it up.
- `packages/env` (server): `MEDIA_S3_ENDPOINT`, `MEDIA_S3_REGION` (default `auto`), `MEDIA_S3_BUCKET`, `MEDIA_S3_ACCESS_KEY_ID`, `MEDIA_S3_SECRET_ACCESS_KEY`. All secret except endpoint/bucket/region. Dev defaults point at MinIO; `.env.example` updated. Production values documented in `docs/deployment.md` (R2 bucket, API token scoped to it).
- `aws4fetch` added to `packages/api` (pin exact version).

### Vocabulary (`packages/shared/src/media.ts`)

- `MEDIA_KINDS`, `MEDIA_VARIANTS` (`full | thumb`), `MEDIA_LIMITS` (15 MB per object, 2048 px full, 512 px thumb, JPEG only, 4 photos per Session).
- `mediaObjectKey(userId, mediaId, variant)` (pure, tested).

### Postgres (`packages/api/src/media/tables.ts`)

- `media` table per the ADR, `CHECK`s on `kind`, `mime = 'image/jpeg'`, `bytes`/`thumb_bytes` ≤ limit, positive dimensions. Index `(user_id) WHERE deleted_at IS NULL`, and `(deleted_at) WHERE deleted_at IS NOT NULL` for the purge job.
- `program.cover_media_id` (text, nullable, no FK cascade: a media row can be deleted while the reference lags).
- Migration adds `media` to the `powersync` publication and grants select.

### API (`packages/api/src/media/`)

- `procedures.ts`: `media.uploadUrl` and `media.downloadUrl` (`authed`, rate limited). Validates ownership, not deleted, variant; the upload URL is signed with `Content-Type: image/jpeg` and `Content-Length` = the row's `bytes`/`thumb_bytes`. Returns `{ url, expiresAt, headers }`.
- `storage.ts`: a small `ObjectStore` (sign PUT, sign GET, delete object, delete prefix via list + batch delete) on `aws4fetch`. One interface so tests hit MinIO, not a mock.
- Sync handler `sync.ts`: PUT/PATCH/DELETE on `media`, refusing foreign ids, unknown kinds, bad sizes. A `media` row is immutable after create except `deleted_at`.
- `program` handler accepts `cover_media_id`, refusing a media id that is missing, foreign or not `kind = program_cover`.
- Job `media.purge-objects` (hourly): objects of media deleted ≥ 1 h ago and not yet purged (`objects_purged_at` column) are deleted, then marked. Idempotent.
- `UserDataPurger` that deletes `users/{userId}/` (register in `platform/user-data.ts`).

### Sync

- `sync-config.yaml`: stream `my_media` (columns listed, user filter, not deleted). `program` stream swaps `cover_key` for `cover_media_id`.
- Client table in `packages/sync/src/media/tables.ts`; local index on `kind`. Parity test passes.
- Store: `createMedia({ kind, width, height, bytes, thumbBytes })` returning the id, `deleteMedia(id)`. Program store gets `setCover(programId, mediaId | null)`, which deletes the previous cover media in the same transaction.

### Native (`apps/native/src/media/`)

- `process-image.ts`: picker result → `{ full, thumb, width, height, bytes, thumbBytes }` (JPEG, re-encoded, EXIF dropped). Reuse the crop logic in `platform/media/cover-pick.ts` for square covers.
- `attachment-queue.ts`: one `AttachmentQueue` from `@powersync/common` wired into the local-database lifecycle (start after connect, stop on sign-out/account switch). Watched ids: live `media` rows. `RemoteStorageAdapter` calls the two procedures, then `fetch`es R2. `LocalStorageAdapter`: the Expo file-system adapter if one ships for our versions, else ours on `expo-file-system` `File`/`Directory`. Download only thumbnails eagerly; full size through `useMediaImage(id, 'full')` on demand, cached under `media/full/` with an LRU cap of 300 MB.
- `use-media-image.ts`: `{ uri | null, state: 'local' | 'uploading' | 'downloading' | 'failed' | 'missing', retry }` for `(mediaId, variant)`.
- `MediaImage` component on `expo-image` with placeholder, upload/failed overlay (PanelUI `Attachment` ideas for the states).
- Replace the Program cover flow: pick → process → `createMedia` + `setCover` in one transaction. Remove `platform/media/cover-files.ts`, `cover-names.ts` (keep crop helpers by moving them), `use-program-cover.ts` local storage, and on first launch delete the old covers folder once (flag in device storage).
- `pnpm knip` clean; `NATIVE_STACK_REVISION` bumped only if a native module is added.

## Tests

- Unit: `mediaObjectKey`, size/variant validation, `process-image` sizing maths (pure part).
- Seam 1 against MinIO: upload URL refused for foreign/deleted/unknown media; a signed PUT with the wrong length or type is rejected by the store; PUT then signed GET round-trips; purge job deletes objects and is idempotent; account purge empties the prefix; the program handler refuses a foreign or wrong-kind cover.
- Seam 3: `media` rows replicate to a second device and never to another account; deleting replicates.
- Parity test passes.

## Done when

Lint, typecheck, knip, test, i18n:check pass; on device a cover picked offline shows at once and uploads when online; a second device shows it.

## Implementation notes

- The `minio/minio` and `quay.io/minio` images are no longer pullable. `docker-compose.yml` pins `bitnamilegacy/minio:2025.7.23-debian-12-r5` (MinIO 2025-07-23) by tag and digest, and runs `minio-init` from the same image (it ships `mc`). Replace it with RustFS if this image becomes a problem (ADR 0040).
- `program.cover_media_id` is `uuid`, like the other id columns (the spec said text).
- The attachment queue keeps two records per media: the full image under the media id, the thumbnail under `<id>_t`. The watch list holds every thumbnail, and a full image only once a record exists (the device made it, or a view asked for it); an evicted full image is archived and leaves the list.
- A cover deleted with its Program is released after the Undo window; a Program deleted on a device that was killed in that window leaves its media orphaned until account deletion (an orphan sweep is not safe before a device has finished its first sync).
- `purgeTombstones` of `media` returns 0, like the training handlers: the tombstone row stays as the marker that stops a late PUT.
