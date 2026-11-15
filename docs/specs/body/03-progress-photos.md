# Body, slice 3: progress photos

Status: ready after media slice 1 and body slice 2. Decisions: [ADR 0040](../../adr/0040-user-media.md), [ADR 0041](../../adr/0041-body-metrics.md).

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
