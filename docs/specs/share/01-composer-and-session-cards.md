# Share, slice 1: composer and Session cards

Status: planned (2026-11-16). Decisions: [ADR 0042](../../adr/0042-share-cards.md).

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
