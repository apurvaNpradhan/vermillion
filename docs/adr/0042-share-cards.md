# 0042. Share cards: images for Sessions, Workouts and Programs

Status: accepted (2026-11-16). Builds on [0038](0038-sessions.md), [0039](0039-hand-tuned-native-themes.md), [0040](0040-user-media.md). Specs: [docs/specs/share/](../specs/share/). Terms: Share card, Template, Sticker, Share composer in [CONTEXT.md](../../CONTEXT.md).

## Context

Sessions, Workouts and Programs share as plain text today (`sessionAsText`, `planAsText` and the system share sheet). Text looks poor in a story or a chat, and nobody reposts it. Spotify's share works better: a designed 9:16 image in the user's colours, sent wherever they like, with a link alongside. A public domain for shared links comes later, but the image share should not wait for it.

## Decision

### What is shared

- A finished **Session** (what I did), a **Workout** and a **Program** (plans).
- The output is a **Share card**: a 1080 × 1920 (9:16 story) image. A 4:5 feed size comes later.
- Sessions also offer a **Sticker**: the stats block alone as a transparent PNG, to lay over your own photo in Instagram Stories. Plans have no sticker.
- **Text share is removed.** `sessionAsText`, `planAsText` and their "Share as text" actions are deleted. Every share action opens the Share composer.

### Templates

- **Session** (swipe between them):
  - **Summary** (the default): date with time of day, a large title, the stats row Duration · Volume · Sets, plus "N Records" when the Session set any. Then the exercise rows: round thumbnail, name, "4 sets · best 100 kg × 5", and a Record mark on exercises that set one.
  - **Muscles**: front and back body map heat from Muscle distribution, the top 3 muscles with their set counts, and the stats row.
  - **Photo**: a Session photo full-bleed with the stats block over a bottom scrim. Offered only when the Session has a photo.
  - **Sticker**: the Summary stats block (title, date, stats) on a transparent background.
- **Workout**: a single card.
  - The Program's title as a small label when the Workout belongs to one, then the Workout title.
  - Stats: N exercises · N working sets · "~55 min" (the existing `estimateMinutes`).
  - A small front and back muscle map.
  - Exercise rows with the editor's plan summary ("3 × 8–10 · RPE 8–9"). Supersets get a side bracket, and warm-ups show as a faint "+2 warm-up". Rest times and notes are left out.
- **Program**: an **Overview** card, then one Workout card per Rotation slot.
  - Overview: cover photo or the theme background, title, "N weeks · N days/week", the Rotation as a day strip (Push · Pull · Legs · Rest …), and the combined muscle map.
  - Each Workout card is labelled "Day 2 of 4 · Pull".
- Every card counts only Counted sets (no warm-ups) in volume, set counts and Records.
- **Long lists**: rows compact to fit up to 12 exercises, then end with "+N more".
- **Footer**: a small fixed wordmark (the app name from App config) and a reserved slot for the public link, empty until the link exists.

### Look

- Cards follow the user's Theme. **Backgrounds**:
  - **Theme** (the default): the surface with a soft accent glow at the top.
  - **Accent**: an accent fill with contrast-safe text.
  - **Light** and **Dark**: the current theme's light or dark palette, whatever the app's appearance.
  - **Photo**: a Session photo or Program cover with a bottom scrim, only when one exists.
- No free colour picker. Text meets AA contrast on every background, and the existing palette contrast tests cover the new pairs.
- Numbers use the sharer's weight unit, in English.

### Privacy toggles

- Session:
  - **Show weights** (on). When off, volume is hidden and best sets read "4 sets · 5–8 reps".
  - **Show exercises** (on). When off, the exercise rows are hidden.
  - **Show photo** (off, and always starts off). It gates the Photo template and the Photo background.
- Workout and Program: **Show weights** (off), which governs planned weights.
- Bodyweight never appears on a card.

### Share composer

- A full-screen route: the live preview at a scaled size, swipe for templates, background swatches, toggles, and two actions:
  - **Save to Photos**: `expo-media-library`, add-only permission, asked the first time you save.
  - **Share…**: `expo-sharing`, the system sheet.
- The last template, background and toggles are remembered per kind (Session, Workout, Program) on the device, in `deviceStorage`. Show photo is never remembered.
- **Entry points**:
  - Session detail: a header share icon, plus "Share" in its menu.
  - After Finish: a "Share" action on the save screen.
  - Workout and Program pages: a header share icon, plus "Share" in their ⋯ menus, replacing "Share as text".

### Rendering

- The card is laid out at 1080 × 1920 logical units off-screen and captured with `react-native-view-shot` at a pixel ratio that gives exactly 1080 × 1920. The preview is the same component scaled down, so what you see is what is saved.
- Format: JPEG (quality ~0.92) for cards, PNG for the Sticker. Files go to the cache directory and are deleted after the share completes.
- Thumbnails and photos come from local Media files and catalog thumbnails already cached. A missing image becomes a letter avatar. Capture never waits on the network, though it waits for local images to finish loading, with a short time limit.
- The new native modules bump `NATIVE_STACK_REVISION` (16) and need a dev-client rebuild.

### Later

- Direct Instagram Stories sharing with a background plus a sticker layer (needs a Meta App ID and native intents).
- The 4:5 feed size, a Record card for a single exercise, and the public link page (to be designed separately).

## Consequences

- Text share disappears. Anyone who relied on pasting a plan as text loses that until the link page exists.
- Cards are pure views of local data, so they work offline.
- The card components are a new public surface of the `session` and `training` verticals. The composer lives in a new `share` vertical that renders cards it receives through those verticals' indexes.
