# Share, slice 1: composer and Session cards

Status: implemented (2026-11-16). Decisions: [ADR 0042](../../adr/0042-share-cards.md).

## Goal

From a finished Session, open a full-screen composer, pick a template, background and toggles, and save or share a 1080 × 1920 image or a transparent Sticker. Remove the Session text share.

## Work

- **Native modules**: add `react-native-view-shot`, `expo-media-library` (add-only, with a photo-library add permission string) and `expo-sharing`. Bump `NATIVE_STACK_REVISION` to 16, add them to `allowBuilds` if needed, and update [native-dev](../../guides/native-dev.md).
- **`share` vertical** (`apps/native/src/share/`):
  - `ShareComposer` takes a kind, a list of templates (id, label, render function, whether it supports a transparent background) and the available toggles.
  - `CardCanvas`: a fixed 1080 × 1920 frame that applies the chosen background and draws the footer (wordmark from App config, and an empty link slot).
  - `captureCard`: view-shot to JPEG or PNG at an exact size, written to the cache and cleaned up after sharing.
  - Save: `expo-media-library`, permission on first save, a refused permission explained with a link to settings. Share: `expo-sharing`.
  - Backgrounds: Theme, Accent, Light, Dark and Photo, derived from the current theme's tokens. Light and Dark use the theme's palette whatever the app's appearance.
  - Remembered choices per kind in `deviceStorage` (`share.<kind>`). Show photo is never stored.
- **Route** `app/share/[kind]/[id].tsx`: full screen, a preview scaled to fit, a horizontal pager for templates with page dots, a swatch row, a toggle row, and Save to Photos / Share… buttons. While the capture runs, the buttons show a busy state.
- **Session cards** (in `session`, exported from its index):
  - Summary, Muscles, Photo and Sticker, per the ADR.
  - Data comes from the Session detail: the existing summary, volume, Records and Muscle distribution helpers, warm-ups excluded.
  - The best set uses the existing record/volume helpers to pick the heaviest Counted set (for duration or distance types, the longest).
  - Rows compact to fit up to 12, then "+N more".
  - Show weights off hides volume and weights. Show exercises off hides the rows. Show photo gates the Photo template and the Photo background.
- **Entry points**: on Session detail, a header share icon, and "Share" replaces "Share as text" in the menu. On the save screen after Finish, a "Share" action.
- **Remove** `sessionAsText`, its tests, `useFinishSession().share` and the unused i18n keys.
- i18n for every label. Brand tokens only; the card's colours come from the theme tokens, never raw values.

## Tests

- Unit (pure helpers in `packages/shared` or the vertical):
  - Best set per exercise, including weight-off text.
  - Row compaction and the "+N more" count.
  - Time-of-day label.
  - Background contrast pairs added to the palette contrast tests.
- No capture in tests. The composer's remembered-choice reader handles missing or garbage storage.

## Done when

All checks pass. On device:

- All four Session outputs save to Photos at 1080 × 1920, and the Sticker keeps its transparency.
- Share… opens the system sheet.
- Each of the 5 themes in light and dark looks right on each background.

## Deferred

- Instagram Stories direct, 4:5, the link (see the ADR).

## As built

- **Modules**: `react-native-view-shot` 6.1.1, `expo-media-library` (the new `Asset` API, add-only: `requestPermissionsAsync(true, [])`) and `expo-sharing`, native stack revision 16. The media-library plugin sets `savePhotosPermission` and an empty `granularPermissions`, so Android 13+ asks for nothing to add and iOS shows the add-photos prompt. No `allowBuilds` entry was needed.
- **Palette** (`packages/ui/src/tokens/share-card.ts`): `cardPalette(appearance, kind)` derives every card colour from the native theme roles. Theme is the surface with an accent glow (`GLOW_ALPHA`) and follows the appearance; Light and Dark are the corresponding fixed `canvas`; Accent is `identity` with `on-identity` ink; Photo is the Dark palette over a uniform full-card `canvas` scrim (`PHOTO_SCRIM_ALPHA`); the Sticker is the Dark palette's `surface` as a solid block. `share-card.test.ts` holds text, secondary and muted text to AA (4.5:1) and the marks to 3:1 on every appearance × background, including text under the glow and headings at y=168, rows, stats and footer under the scrim over a white photo.
- **`share` vertical**: `ShareComposer<Id>` takes `kind`, `title`, `templates` (`id`, `label`, `render(ctx)`, `supportsTransparent`, optional `requires` toggle and `fixedBackground: "photo"`), `toggles` (`id`, `label`, `defaultOn`, `remember`) and an optional `photo` layer whose `requires` privacy gate is optional, so Program covers can always be available. A Program's several cards are simply several templates. `supportsTransparent` means the template is a Sticker: a transparent canvas, no footer, no swatches, PNG. `CardCanvas` is the 1080 × 1920 frame (background, glow or scrim, content, and a footer with the wordmark from App config and an empty `link` slot). `CardText` never follows the device font scale.
- **Capture**: the preview and export share one density-adjusted frame, laid out at `1080 / PixelRatio` × `1920 / PixelRatio` logical units. A single inner scale maps the existing 1080 × 1920 design into it, so Android's initial capture bitmap is about 8 MB rather than density-squared larger. Android requests 1080 × 1920 pixels; iOS requests density-divided points because view-shot multiplies by device scale. JPEG 0.92 and transparent Sticker PNG both target exactly 1080 × 1920. The dimension maths is unit-tested at densities 1, 2, 2.625, 3 and 4.
- **Files**: captures are copied to the owned `cache/share-cards` directory, then view-shot's original is released with `releaseCapture`, including iOS temporary files outside the cache. Save-to-Photos copies are deleted immediately, including denied or failed saves. Shared copies survive recapture and composer close; the next composer open prunes files older than one hour. The receiving app can continue reading after the share sheet returns.
- **Local images**: `MediaImage localOnly` reads existing file URIs without `wantFull`, touch or retry side effects. Session photos use an existing full file, else an existing local thumbnail. Card exercise thumbnails resolve catalog entries with `Image.getCachePathAsync` and only pass the resulting local path to the image view; cache misses show the letter avatar. Local lookup and image loading participate in the 1.5 s image gate, with no card-triggered network request. Card images have no transition fade.
- **Remembered choice** (`share.<kind>` in `deviceStorage`): `readChoice` parses with zod and falls back field by field (missing, malformed, a template that no longer exists); toggles with `remember: false` (Show photo) are never written or read. A remembered Photo background that is no longer offered falls back to Theme.
- **Session cards** (`session/share/`): `card-data.ts` turns a Session into formatted data (stats, Records, rows, top muscles) with the toggles applied; `best-set.ts`, `rows.ts`, `muscles.ts`, `time-of-day.ts` are the pure helpers, all unit-tested. Records sum all Record keys on Counted sets, rather than counting record-bearing sets. Weight and reps types show the heaviest set (ties by reps); bodyweight, assisted and rep-only types show reps (no weight, so no bodyweight); duration, distance, floors and steps types the longest. With Show weights off volume is dropped and weight-and-reps rows read "5–8 reps". Up to 12 rows, row size steps down at 7 and 10 rows, then "+N more". Time of day is by the user's time zone (morning 5–11, afternoon 12–16, evening 17–20, otherwise night). The Photo template and Photo background use the Session's first photo (full variant when this device has it, else the thumbnail).
- **Entry points**: the Session detail header share icon and a "Share" menu action; the save screen has a "Save and share" button, since the card is made from the saved Session (the title, duration and date are only written on Save): it runs the normal save, then closes the screen and opens the composer.
- **Removed**: `sessionAsText` and its test, `useFinishSession().share`, and the keys `session__share_text`, `session__share_stats`, `session__share_effort`. `planAsText` and `useSharePlan` stay until slice 2.
- **Also changed**: `BodyMapPair` takes `maxFigureWidth`; `media` exports `removeCachedFile`; the route needs `pnpm --filter native routes:types` in a fresh worktree (create `apps/native/.expo/types` first).

### Not verified here

No device build was possible. Check on a device: the capture size of all four outputs and the Sticker's transparency, that `view-shot` renders `react-native-svg` gradients and expo-image pictures, scaled-preview capture on Android and iOS, the add-photos prompt and the denied path, the share sheet, and the five themes in light and dark on each background. Also verify Android peak capture memory, local-only image fallbacks while offline, and delayed recipient reads after closing or recapturing.
