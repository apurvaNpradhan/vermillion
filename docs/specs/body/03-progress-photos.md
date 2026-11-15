# Body, slice 3: progress photos

Status: implemented (2026-11-15), after media slice 1 and body slice 2. Decisions: [ADR 0040](../../adr/0040-user-media.md), [ADR 0041](../../adr/0041-body-metrics.md).

## Goal

Front/side/back photos in a Check-in, a private gallery, and a side-by-side Compare.

## Work

- `progress_photo` table and client table per the ADR (`pose` in `front | side | back`), joins the `my_body` stream; handler refuses foreign/wrong-kind media and unknown poses; deleting a photo deletes its media.
- Store: `addProgressPhoto(pose, mediaId, localDate)`, `deleteProgressPhoto`. Watches: by date, by pose, latest.
- **Check-in**: three pose slots at the top (camera or library via an action sheet; Back optional); photos are processed and created with the rest of the Check-in.
- **Photos page** `body/photos`: grid grouped by date, pose filter chips, Compare action. Thumbnails blurred while `ui.hidePhotos` is on (default true) until tapped; toggle in the page's menu and in settings.
- **Compare** `body/compare`: pick pose, then two dates (defaults: first and latest); PanelUI `Compare` slider copied in; under each side the weight trend and waist on that date.
- **ImageViewer** copied in from PanelUI: full screen, pinch zoom, swipe between photos of a day; loads the full variant on demand.
- Measurements page first tile: latest photo (blurred per setting) and its date. Home Photos card: latest thumbnail, "N days since last photos".
- i18n, tokens, and ADR 0030 header comments on every copied component.

## Tests

- Unit: any pure selection helpers (default compare dates, grouping).
- Seam 1: handler refusals.
- Seam 3: a progress photo row reaches a second device.

## Done when

Checks pass; on device photos upload, show blurred by default, compare works with two dates.

## As built

- Table `progress_photo` (one photo per media, a retake on the same day is another row; no foreign key to `media`, since rows point at media and never the other way). Handler `packages/api/src/body/photo-sync.ts`; a DELETE also soft-deletes the media, so the files go within a day even if the media's own DELETE never arrives. Client table and store in `packages/sync/src/body/`. Stream `my_body` carries both tables.
- Store: `addProgressPhoto` takes the processed image's facts with the pose and date and writes the media row and the photo in one transaction (the `setProgramCoverToNewMedia` pattern); `deleteProgressPhoto` deletes both and returns the media id so the caller drops the files. Watches: all photos (optionally one pose), one date, latest.
- Check-in: three slots above the date (camera or library through an action sheet, Back optional). Picked photos are processed at once and written on Save with the measurements; if a photo fails after the measurements were saved the sheet closes with a toast (re-saving would log every measurement twice).
- Camera: `expo-image-picker`'s camera, with a permission string (native stack revision 14, [native-dev](../../guides/native-dev.md)). A refused permission says how to allow it.
- Hide photos: `ui.hidePhotos` (default on), a switch in Settings and in the Photos page menu. The blur is expo-image's `blurRadius` on the thumbnail's pixels, not an `expo-blur` layer: on Android `expo-blur` renders a plain translucent view unless a blur target is wired, which is not good enough for private photos. A reveal lasts while the page is open. Compare shows photos clear: opening it is the reader's own choice.
- Photos page `body/photos` (grid by date, 3 columns of 3:4 tiles, pose chips, Check-in and Compare buttons, long press for Delete with a confirmation). Compare `body/compare` (pose chips, a date chip row per side, the slider, weight trend and waist under each side, and the change since the earlier date). Defaults: the first and the latest date of the pose; the first pose with two dates when none is chosen.
- Components: `Compare` and `ImageViewer` are copied in under [0030](../../adr/0030-native-component-sourcing.md). `MediaViewer` (`apps/native/src/media/`) takes media ids and an index, so Session photos can reuse it; each page shows the thumbnail at once and the full variant when this device has it (the page requests it on demand).
- Pure helpers with tests: grouping, pose dates, default compare dates, days since, latest on or before a date (`packages/shared/src/body/photos.ts`), the compare side stats, the viewer geometry and the seam maths.

## Deferred

- The ghost overlay of the last photo for alignment (needs `expo-camera`).
- Editing a photo's date or pose (a photo is written once; delete and add again).
- Showing the photo's pose and date in the viewer is a caption only; there is no per-photo menu in the viewer yet.
