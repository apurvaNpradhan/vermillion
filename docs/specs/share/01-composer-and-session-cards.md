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
- **Palette** (`packages/ui/src/tokens/share-card.ts`): `cardPalette(theme, appearance, kind)` derives every card colour from a theme's roles. Theme is the surface with an accent glow (`GLOW_ALPHA`) and follows the appearance; Light and Dark are that theme's fixed `canvas`; Accent is `identity` with `on-identity` ink; Photo is the Dark palette over a `canvas` scrim (`PHOTO_SCRIM_ALPHA`); the Sticker is the Dark palette's `surface` as a solid block. `share-card.test.ts` holds text, secondary and muted text to AA (4.5:1) and the marks to 3:1 on every theme × appearance × background, including text under the glow and under the scrim over a white photo.
- **`share` vertical**: `ShareComposer<Id>` takes `kind`, `title`, `templates` (`id`, `label`, `render(ctx)`, `supportsTransparent`, optional `requires` toggle and `fixedBackground: "photo"`), `toggles` (`id`, `label`, `defaultOn`, `remember`) and an optional `photo` layer. A Program's several cards are simply several templates. `supportsTransparent` means the template is a Sticker: a transparent canvas, no footer, no swatches, PNG. `CardCanvas` is the 1080 × 1920 frame (background, glow or scrim, content, and a footer with the wordmark from App config and an empty `link` slot). `CardText` never follows the device font scale.
- **Capture**: the preview is the real frame inside a scaled wrapper, and `captureCard` targets the unscaled inner frame with `width`/`height` 1080 × 1920 (JPEG 0.92, PNG for the Sticker, `tmpfile` in the cache). An image gate counts pictures still loading (cards register through `useImageSettle`; `MediaImage` and `ExerciseThumbnail` gained an `onSettled`), and the capture waits at most 1.5 s for them, never for the network. A saved file is deleted at once; a shared one stays until the next capture or the composer closing, since the receiving app may still be reading it when the sheet returns.
- **Remembered choice** (`share.<kind>` in `deviceStorage`): `readChoice` parses with zod and falls back field by field (missing, malformed, a template that no longer exists); toggles with `remember: false` (Show photo) are never written or read. A remembered Photo background that is no longer offered falls back to Theme.
- **Session cards** (`session/share/`): `card-data.ts` turns a Session into formatted data (stats, Records, rows, top muscles) with the toggles applied; `best-set.ts`, `rows.ts`, `muscles.ts`, `time-of-day.ts` are the pure helpers, all unit-tested. Weight and reps types show the heaviest set (ties by reps); bodyweight, assisted and rep-only types show reps (no weight, so no bodyweight); duration, distance, floors and steps types the longest. With Show weights off volume is dropped and weight-and-reps rows read "5–8 reps". Up to 12 rows, row size steps down at 7 and 10 rows, then "+N more". Time of day is by the user's time zone (morning 5–11, afternoon 12–16, evening 17–20, otherwise night). The Photo template and Photo background use the Session's first photo (full variant when this device has it, else the thumbnail).
- **Entry points**: the Session detail header share icon and a "Share" menu action; the save screen has a "Save and share" button, since the card is made from the saved Session (the title, duration and date are only written on Save): it runs the normal save, then closes the screen and opens the composer.
- **Removed**: `sessionAsText` and its test, `useFinishSession().share`, and the keys `session__share_text`, `session__share_stats`, `session__share_effort`. `planAsText` and `useSharePlan` stay until slice 2.
- **Also changed**: `BodyMapPair` takes `maxFigureWidth`; `media` exports `removeCachedFile`; the route needs `pnpm --filter native routes:types` in a fresh worktree (create `apps/native/.expo/types` first).

### Not verified here

No device build was possible. Check on a device: the capture size of all four outputs and the Sticker's transparency, that `view-shot` renders `react-native-svg` gradients and expo-image pictures, scaled-preview capture on Android and iOS, the add-photos prompt and the denied path, the share sheet, and the five themes in light and dark on each background. A 1080 × 1920 frame is large on a high-density Android screen (about 57 MB of bitmap at 2.6×): if capture fails with an out-of-memory error, lay the frame out smaller and keep the pixel size through `width`/`height`.
