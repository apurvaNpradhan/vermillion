# Media, slice 2: Custom exercise image, avatar and Session photos

Status: implemented; device validation pending. Decisions: [ADR 0040](../../adr/0040-user-media.md). Builds on [01-foundation](01-foundation.md).

## Goal

Three more image uses on the single upload path.

## Work

- **Custom exercise image.** `exercise.image_media_id` (nullable, Custom exercises only; the handler refuses it on catalog rows and refuses a media id that is foreign or not `kind = exercise_image`). Added to the library stream. The exercise form gets a photo row (pick, replace, remove). Wherever a thumbnail is drawn (`exercise/media-url.ts` callers, round thumbnails), a Custom exercise with an image shows its thumbnail variant; otherwise the current fallback.
- **Avatar.** `ui.avatarMediaId` in `packages/shared/src/preferences.ts`. Profile settings get a round avatar picker (square crop, shown in a circle). Setting a new avatar deletes the previous media. Shown in Settings header and Profile.
- **Session photos.** Synced `session_photo (id, user_id, session_id, media_id, position, created_at, deleted_at)`, in `my_training`; handler limits 4 live photos per Session, refuses foreign Session/media or wrong kind. Store: `addSessionPhoto`, `removeSessionPhoto`, `moveSessionPhoto`.
  - Finish sheet: an optional "Add photos" row (up to 4, camera or library).
  - Session detail: a photo strip (PanelUI `Carousel` ideas, our tokens) with add/remove; tap opens a full-screen viewer (the `ImageViewer` port lands here if body slice 5 has not landed yet; otherwise reuse it).
  - History rows show a small photo count/thumbnail when present.
- i18n for every string.

## Tests

- Unit: any pure helpers (position ordering, limit checks).
- Seam 1: each handler refusal above; 5th photo refused.
- Seam 3: a Session photo row reaches a second device.

## Done when

Checks pass; on device each of the three flows uploads and shows on another device.

## Integration and validation

- Session photos expose `onOpenPhoto(index)` on `SessionPhotos`. The shared viewer is supplied
  by the parallel progress-photo slice; no viewer was copied here.
- Camera capture adds the camera permission and native runtime revision 14. A binary with that
  revision is needed for the camera smoke test; the native app was not built during this work.
- Session deletion retains its photo media through Undo, then releases it if the Session is still
  absent. The discard snapshot keeps the media ids because sync can remove the photo rows before
  the Undo timer fires.
- Automated coverage includes reference ownership and kind refusals, the four-photo limit,
  exercise-image replacement, Session deletion/Undo cleanup, and two-device photo replication.
- Device validation remains: pick/replace/remove each image kind, camera permission and capture,
  offline rendering, transfer Retry, and displaying the result on a second device.
