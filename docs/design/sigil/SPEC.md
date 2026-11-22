# Sigil brand spec

The agreed brand for the rename from Patina to Sigil (grilled 2026-11-22). Build from this file.
Where it disagrees with an older doc, this file wins.

## Identity

- Name **Sigil**. Store and site title **Sigil: Strength Log**. Tagline **Earn the mark.**
- Website manifesto headline **The iron remembers.**, with the small label `NONFINITO` above it (an
  easter egg for Michelangelo's unfinished technique; never explained).
- Subtitle: "A private log for training — and soon, food." stays.
- Slug and scheme `sigil` / `sigil://`, bundle id `io.github.apurvanpradhan.sigil`, hosts
  `sigil.`, `sigil-api.`, `sigil-sync.lostsignal.cloud`. Old `patina*` hosts are dropped, no aliases.
- Concept: you carve yourself out of the stone, set by set. A mason's mark is a sigil: the mark a
  stonemason cut into each block they finished. No mascot. No tortoise anywhere.

## Mark

- `mark.svg` (**A**, mason's mark, no dot): app icon, adaptive icon, monochrome/themed icon,
  notification icon, favicon, nav lockup, anywhere at 32px or less.
- `mark-ember.svg` (**A2**, the same mark plus one ember dot): 48px and up on brand surfaces
  (website hero/close, sign-in, splash poster, share cards). The dot is the brand's single red point.
- Never redraw, rotate, outline or add effects to the mark. Ink colour only; the dot is the only ember.
- App icon: ground `#0B0A09`, ivory `#ECE6D8` mark A at ~58% of the icon, optically centred. Adaptive
  icon: same, mark inside the 66dp safe circle; monochrome layer = mark A. Notification icon: mark A,
  white on transparent, check mdpi so the stem does not vanish.
- Wordmark lockup: mark + `SIGIL` in EB Garamond 500, uppercase, tracking +0.18em, mark height ≈ 1.1×
  cap height, gap 0.5 cap height.
- Secondary motif **G**, the golden-ratio construction (circle + golden rectangle + spiral, hairlines):
  see `construction-reference.tsx`. Used for the website hero overlay, app empty states and the seal.
  It is never the logo.

## Colour (two inks, one rare ember)

| Role                                                              | Dark                  | Light                 |
| ----------------------------------------------------------------- | --------------------- | --------------------- |
| ground                                                            | `#0B0A09`             | `#EFEBE2`             |
| raised (cards, no borders)                                        | `#161412`             | `#F7F4EE`             |
| control (inputs, tracks)                                          | `#201E1B`             | `#E3DED3`             |
| floating (sheets, toasts)                                         | `#1B1917`             | `#F7F4EE`             |
| ink                                                               | `#ECE6D8`             | `#141210`             |
| ink secondary                                                     | `#CFC8BA`             | `#3A3631`             |
| muted                                                             | `#A39D90`             | `#5F5A52`             |
| hairline                                                          | `#2B2824`             | `#D6CFC2`             |
| ember (mark dot, PR star, current-set bar, today, active-tab dot) | `#E04A2F`             | `#B5321A`             |
| ember text                                                        | `#F06A4E`             | `#B5321A`             |
| ember soft (selected chip ground)                                 | `#321C16`             | `#EFDDD5`             |
| done (lichen; completed sets)                                     | `#A9BC9A`             | `#4A6541`             |
| done soft (completed row fill)                                    | `#22261E`             | `#DCE0D2`             |
| danger (always with an icon and words)                            | `#F28BA3`             | `#83193E`             |
| warning                                                           | `#D9B66A`             | `#765810`             |
| action fill (primary button) / on-action                          | `#ECE6D8` / `#0B0A09` | `#141210` / `#F7F4EE` |
| focus ring                                                        | ink                   | ink                   |

Rules:

- Primary buttons, links, toggles, progress rings and rest timers are **ink**, never ember.
- Ember means "you / now / earned" only: the current set's leading bar and number, a personal record,
  today in the week strip, the active tab's dot, a selected filter chip's text. Nothing else.
- Completed sets: lichen fill and lichen check box; the check shows on completed sets only.
- Ember is never used for errors; danger is the cooler rose, always with an icon and wording.
- All text pairs pass WCAG AA; keep the existing contrast tests and extend them to Sigil.

## Type

- Display serif **EB Garamond** (OFL), weight 500–600, mixed case, tracking about -0.01em at large
  sizes. Italic only for the tagline. No distress, no texture on type, anywhere.
- UI **Geist**, labels **Geist Mono** uppercase +0.14em (labels only where they carry real data:
  weights, dates, set counts, versions; no fake barcodes or index codes).
- Native: EB Garamond only for large titles of tab roots (Train, History, Exercises, Body, Settings),
  onboarding step titles, the sign-in wordmark and the session finish title. Collapsed headers and
  everything else stay Geist.

## Imagery

- One photograph: Michelangelo's _'Atlas' Prisoner_, `source/atlas-prisoner-jbu-02.jpg`, graded as a
  clean ivory-on-ink duotone (crush blacks, ivory highlights, no dither, no halftone, no grain baked in).
  Credit line required wherever it appears: see `source/CREDITS.md`.
- No other figures. Empty states use construction drawings, not sculptures.

## Native app (Sigil theme)

- Themes: **Sigil (default)** and **Classic**. Each has light and dark. Saved `patina`, `oxide` or any
  removed id falls back to Sigil.
- Working screens stay flat: no texture, no grain, no borders (depth from surface steps only).
- Sign-in / welcome: always dark. The graded Atlas photo fills the top ~65% and fades into the ground;
  mark A2 top-left; `Sigil` in EB Garamond (~64dp) bottom-left; "Earn the mark." in Geist muted;
  email field; ink "Continue with email" button; Terms/Privacy footnote. Credit line available from
  the screen (e.g. a small "Photo credit" row in About/Settings → Licences).
- Empty states: a hairline construction drawing (circle + golden rectangle + spiral) in `muted`,
  ~170dp, then a mono label with the real count (`0 WORKOUTS`), one plain line ("No workouts logged
  yet."), at most one ink action. Rendered with react-native-svg.
- Record toast: floating surface, ember mark-dot or star-free glyph (use a small ember dot, not a star),
  text "Bench press personal record: 102.5 kg × 5". One success haptic, no confetti.
- Share cards: Sigil cards have **no glow** (`glow: null` for Sigil only; Classic unchanged), two inks,
  ember only for records, mark A2 in the footer, keep story-safe insets and the photo/sticker modes.
  No lifetime counters, no barcodes.

## Website (apps/web)

Mockup reference: React page in the session scratchpad (`mock2`), summarised here.

- Sections: hero (photo right, construction overlay drawing itself once, `Sigil` mast, tagline,
  h1 "A strength log for Android.", lead, Download APK + Add to Obtainium, fact line) → manifesto
  (`NONFINITO` label, "The iron remembers." with "remembers." in ember italic, two paragraphs) →
  "What it does in the gym." four feature cards → paper band "Install it from GitHub." with the photo in
  a black panel → close (circular-text seal around mark A2, "Earn the mark.", Download) → footer with
  credit line. `/screens` holds the real app screenshots. Legal pages use the same system, plain.
- React Bits components (MIT + Commons Clause; source via `https://reactbits.dev/r/<Name>-TS-CSS.json`):
  Noise, SplitText, ScrollReveal, SpotlightCard, CircularText, Magnet. Client-only, every one guarded
  for reduced motion. No WebGL backgrounds.

## Voice

Plain, short, stoic; never cosplay. Keep the app's term "personal record". Examples:
"Log your sets and see what you lifted last time." · "No workouts logged yet." ·
"Your personal records will appear here." · "Bench press personal record: 102.5 kg × 5."
"Earn the mark." appears in the hero, sign-in and the close, and almost nowhere else.
