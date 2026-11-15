# 0040. User media: a private R2 bucket behind PowerSync attachments

Status: accepted (2026-11-15). Specs: [docs/specs/media/](../specs/media/). Terms: Media, Media reference, Catalog media in [CONTEXT.md](../../CONTEXT.md).

## Context

The app shows images from one place today: the public exercise catalog bucket (`media.lostsignal.cloud`), whose objects are named by `exercise.thumbnail_key` and `video_key`. A Program cover is picked and cropped, but the file stays in the device's documents folder: `program.cover_key` has been null since ADR 0036, "until covers can be uploaded".

Coming features need user images: covers, a Custom exercise image, a profile avatar, Session photos, and progress photos ([0041](0041-body-metrics.md)). Progress photos are sensitive. The app is local-first ([0015](0015-powersync-self-hosted.md)): a row must exist and render offline, while its file may arrive later.

PowerSync ships an attachments API (`AttachmentQueue`, in `@powersync/common` since 2.x). A synced row holds an attachment id; the queue watches those ids, keeps a local-only `attachments` table of file states, uploads what this device made and downloads what other devices made, through a `RemoteStorageAdapter` we write and a `LocalStorageAdapter` for the file system.

## Decision

### Two buckets

- **Catalog media** stays in the existing public bucket. It is written only by the server and, later, by the admin site. Rows keep plain keys.
- **User media** goes to a new **private** R2 bucket. No object is publicly readable. Keys are `users/{userId}/{mediaId}.jpg` (full size) and `users/{userId}/{mediaId}_t.jpg` (thumbnail).

### Presigned URLs, no bytes through the API

- `media.uploadUrl({ mediaId, variant })` signs a PUT valid for 5 minutes. `media.downloadUrl({ mediaId, variant })` signs a GET valid for 1 hour. Both are `authed`. The server checks that the `media` row exists, belongs to the session user and is not deleted, and that its MIME type (`image/jpeg` only) and byte size (≤ 15 MB) are allowed. The PUT is signed with its content type and length, so R2 rejects anything else.
- Signing uses `aws4fetch` (small, no dependencies, Cloudflare's documented R2 client). Not the AWS SDK.
- Local development and CI use a pinned final MinIO image in `docker-compose.yml`, which checks signatures the same way. RustFS is the fallback if that image becomes a problem. Staging and production use R2.

### Data model

- A synced **`media`** table: `id` (UUIDv7, made on the device), `user_id`, `kind` (`program_cover | exercise_image | avatar | session_photo | progress_photo`), `mime`, `width`, `height`, `bytes`, `thumb_bytes`, `created_at`, `deleted_at`. It is in the `my_media` stream.
- Rows point at media; media never points back.
  - Single images use a column: `program.cover_media_id`, `exercise.image_media_id` (Custom exercises only), `ui.avatarMediaId` in preferences (the Better Auth `user` table is not synced).
  - Lists use a child table: `session_photo (session_id, media_id, position)` with at most 4 per Session, and `progress_photo` ([0041](0041-body-metrics.md)).
- `program.cover_key` is retired. It stays in Postgres (migrations are additive) and leaves the stream.
- Users upload images only. Video stays Catalog media.

### On the device

- Every picked or captured image is re-encoded on the device with `expo-image-manipulator`: a JPEG with a 2048 px long edge and a 512 px thumbnail. Re-encoding strips EXIF, including location. Nothing is processed on the server.
- The queue watches every live `media` row of the user (`deleted_at IS NULL`); references only decide where an image shows.
- Creating media is one local transaction: write the `media` row and the reference, then hand both files to the queue. The row renders at once from the local file.
- **Thumbnails download eagerly** on every device of the owner. **Full-size** images download when first opened (a signed GET), into a cache with a size cap. Uploads use any network.
- The old local-only cover path is removed. Its folder is deleted once on first launch after the update; existing local covers are not migrated (synthetic data only, [0026](0026-no-e2e-and-privacy-readiness.md)).

### Deletion

- Deleting soft-deletes the `media` row and removes the device's files at once.
- A server job deletes the R2 objects of media deleted more than 1 hour and less than 24 hours ago (it runs hourly, idempotent), so a deleted photo is gone within a day, not after the 120-day tombstone purge. The tombstone row follows the normal purge.
- Account deletion deletes the whole `users/{userId}/` prefix as a `UserDataPurger`.

### Catalog and the admin site (later, recorded only)

The admin site is a separate, online-only app. It will call role-checked oRPC procedures that sign PUTs to the **public** bucket under `catalog/exercises/{exerciseId}/thumb.jpg` and `video.mp4`, then update the catalog row in Postgres; PowerSync replicates the row as it does today. Nothing of this is built now.

## Consequences

- One upload path for every image. A new image feature adds a `kind` and a reference column or child table.
- Files can lag rows. Every image view has a placeholder, an "uploading" state and a "failed, retry" state.
- R2 becomes a processor that holds health-adjacent data; the [privacy readiness](../privacy-readiness.md) checklist gains bucket rows.
- MinIO in compose adds a service to `pnpm db:start`.
