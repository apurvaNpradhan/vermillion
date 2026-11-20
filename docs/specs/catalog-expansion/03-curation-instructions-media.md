# Catalog expansion, slice C: review, instructions, media

Status: after slice B. Decisions: [ADR 0050](../../adr/0050-muscle-details-and-catalog-expansion.md).

## Goal

Every approved new row has instructions written by us and media in our bucket; the three patch files are complete and validate.

## Work

### Review (owner)

The owner works through the review page. The lead reads the decisions back in batches and reruns `build-patches.ts`.

### Instructions

- For approved candidates only. Written from the movement, not copied from any source: at most 5 numbered steps, same voice and format as the current catalog (`1. … \n2. …`), within `EXERCISE_INSTRUCTIONS_MAX`.
- Produced in batches of about 50 by group, added to the review page as a fourth view ("Instructions") for approve or edit, then merged into `0002-expansion.json`.

### Media (`scripts/catalog/copy-media.ts <keys.json>`)

- Copies each approved row's source PNG and MP4 from the source bucket to the exercise media bucket (`EXERCISE_MEDIA_S3_BUCKET`) under `exercises/v2/`:
  - thumbnail: PNG → WebP with `sharp` (a dev dependency of the scripts package), resized to the current thumbnails' pixel size (measure one existing thumbnail first), original background kept, under `EXERCISE_MEDIA_LIMITS.thumbnail.maxBytes`; plain variants preferred over `GREEN` ones;
  - video: copied as is if under `EXERCISE_MEDIA_LIMITS.video.maxBytes`, else listed for a decision.
  - `_medium.png` exists in the source only for exercises with no video; it is that exercise's main
    image. When an approved row has no video, also copy its medium PNG (converted to WebP at full
    size, its own key under `exercises/v2/`) and keep it with the row; the small PNG still makes the
    thumbnail. Rows with a video never use a medium PNG.
- Idempotent (skips keys already present with the same size), resumable, prints a summary. Credentials for both buckets come from the environment at run time; none are committed.
- Writes the new keys into `0002-expansion.json`.

### Compare (owner)

- A small side-by-side page: 20 current thumbnails next to the converted source versions of the same movements. The owner decides whether the existing 455 switch; a switch is a later patch of `change`s on `thumbnail_key`/`video_key`.

## Done

`build-patches.ts` validates all three files against the seed; every inserted row has a thumbnail, a video and instructions.
