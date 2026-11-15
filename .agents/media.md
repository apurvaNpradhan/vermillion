# Media

User images (covers, progress photos, later avatars and Session photos) live in a private R2 bucket; the app is local-first, so a row renders offline and its file arrives later. Decisions: [ADR 0040](../docs/adr/0040-user-media.md); plan: [docs/specs/media/](../docs/specs/media/). Terms: Media, Media reference, Catalog media in [CONTEXT.md](../CONTEXT.md).

## Layout

- `packages/shared/src/media.ts`: kinds, variants, limits, `mediaObjectKey`, attachment ids, sizing maths.
- `packages/api/src/media/`: `tables.ts` (`media`), `storage.ts` (`ObjectStore` on `aws4fetch`), `procedures.ts` (`media.uploadUrl`, `media.downloadUrl`), `sync.ts` (upload handler), `reference.ts` (`assertMediaReference` for other verticals' rows), `purge.ts` (hourly `media.purge-objects`), `operations/`.
- `packages/sync/src/media/`: client `media` table, the local-only `attachments` table (owned by PowerSync's `AttachmentQueue`), `createMedia` / `deleteMedia`, and the transaction helpers (`insertMedia`, `removeMedia`) that reference stores use.
- `apps/native/src/media/`: `process-image.ts` (re-encode), `pick-image.ts` (library or camera), `attachment-queue.ts`, `local-storage.ts` and `remote-storage.ts` (the queue's adapters), `use-media-image.ts`, `MediaImage` (optional `height` and `blurRadius`), `MediaViewer` (full screen over media ids, built on `platform/ui/image-viewer`).

## Rules

- Two buckets: Catalog media is public and server-written, with plain keys on the row (`exercise.thumbnail_key`). User media is private, keyed `users/{userId}/{mediaId}.jpg` and `_t.jpg`. Nothing is publicly readable; the app only uses presigned URLs, and bytes never pass through the API.
- A new image feature adds a `kind`, and a reference column or child table on the row that shows it. Rows point at media; media never points back. A handler that accepts a reference calls `assertMediaReference` (missing, foreign and wrong-kind are refused alike).
- A reference and the media it replaces change in one local transaction (`setProgramCoverToNewMedia`): the upload is one transaction, so the server never sees a reference to a media it has not got. Files first, row after: `queue.addFiles` before the write, `queue.discard` after a delete or a failed write.
- Re-encode on the device (`expo-image-manipulator`: JPEG, 2048 px full, 512 px thumbnail). That strips EXIF, location included. Nothing is processed on the server.
- Thumbnails download eagerly on every device; full images are requested by `useMediaImage(id, "full")` and cached with a 300 MB LRU cap. Every image view shows a placeholder, an uploading state and a failed state with Retry (`MediaImage`). Offline is not a failure.
- Deleting soft-deletes the row and drops the device's files at once; the server job deletes the objects at least an hour later, and the account purger deletes the whole `users/{userId}/` prefix.
- The `media` handler is write-once: a PUT repeating the stored values is fine, anything else is `MEDIA_IMMUTABLE`.

## Progress photos

`progress_photo` (`packages/api/src/body/`, ADR 0041) is the child table for body photos: its handler (`photo-sync.ts`) refuses a foreign, missing, wrong-kind or already-used media (`MEDIA_REFERENCE_INVALID`), is write-once, and deleting a photo soft-deletes its media. On the device `addProgressPhoto` writes the media row and the photo in one transaction and `deleteProgressPhoto` removes both (`packages/sync/src/body/photo-store.ts`). Hide photos (`ui.hidePhotos`, default on) blurs thumbnails on Home, the gallery and the Measurements first tile until tapped: the blur is `MediaImage`'s `blurRadius`, on the image's own pixels, not a layer over it. The Check-in sheet picks and processes photos at once and writes them with the rest on Save.

## Environment

`MEDIA_S3_ENDPOINT`, `_REGION`, `_BUCKET`, `_ACCESS_KEY_ID`, `_SECRET_ACCESS_KEY` ([environment](environment.md)). Development and CI use the MinIO of `docker-compose.yml` (started by `pnpm db:start`, bucket `vermillion-user-media`); production uses R2 with a token scoped to the one bucket ([deployment](../docs/deployment.md)). On a phone, reach MinIO with `adb reverse tcp:9000 tcp:9000`.

## Tests

Seam 1 (`packages/api/src/media/media.test.ts`) runs against MinIO: signed PUT and GET round trip, the store refusing a wrong length or type, the purge job, the account purge. Seam 3 (`tests/sync/src/media.test.ts`) covers the rows on two devices. The queue's pure parts (state mapping, failure counting, path rules, remote adapter with a replaced `fetch`) are unit tested in `apps/native/src/media/`; the file system adapter and the picker need a device.
