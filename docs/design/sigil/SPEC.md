# Sigil brand spec

> **Historical.** The colour, type, imagery and tagline decisions below were replaced on 2026-11-23 by
> [the redesign spec](../redesign-2026-11/SPEC.md) and [ADR 0059](../../adr/0059-amoled-neutral-modes-and-accent-split.md).
> The name, identifiers and hosts still stand. Do not build from the rest of this file.

The agreed brand for the rename from Patina to Sigil (grilled 2026-11-22). Build from this file.
Where it disagrees with an older doc, this file wins.

## Identity

- Name **Sigil**. Store title **Sigil: Strength Log**. Tagline **Earn the mark.**
- Retain the `NONFINITO` label on the website manifesto. It refers to Michelangelo’s unfinished technique.
- Subtitle: "A private log for training — and soon, food." stays.
- Scheme `sigil://`, EAS slug `vermillion`, bundle id `io.github.apurvanpradhan.sigil`, hosts
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
- Wordmark lockup: mark + `SIGIL` in Geist 600, uppercase, tracking +0.18em, mark height ≈ 1.1×
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
- Completed sets: lichen fill and lichen check box; the uncompleted box shows a muted check.
- Ember is never used for errors; danger is the cooler rose, always with an icon and wording.
- All text pairs pass WCAG AA; keep the existing contrast tests and extend them to Sigil.

## Type

- **EB Garamond** (OFL) is reserved for Nonfinito. The website hero uses the React Bits Tech Text
  wordmark in Barlow Condensed.
- UI **Geist**, labels **Geist Mono** uppercase +0.14em (labels only where they carry real data:
  weights, dates, set counts, versions; no fake barcodes or index codes).
- Native uses Geist for titles, the sign-in wordmark and the session finish title.

## Imagery

- One photograph: Michelangelo's _'Atlas' Prisoner_, `source/atlas-prisoner-jbu-02.jpg`, graded as a
  clean ivory-on-ink duotone (crush blacks, ivory highlights, no dither, no halftone, no grain baked in).
  Attribution is in the repository README and `source/CREDITS.md`.
- No other figures. Empty states use construction drawings, not sculptures.

## Native app (Sigil theme)

- Theme: **Sigil** in light and dark. Saved `classic`, `patina`, `oxide` and other retired ids fall
  back to Sigil.
- Working screens stay flat: no texture, no grain, no borders (depth from surface steps only).
- Sign-in / welcome: always dark. The graded Atlas photo fills the top ~65% and fades into the ground;
  mark A2 top-left; `Sigil` in Geist (~64dp) bottom-left; "Earn the mark." in Geist muted;
  ink Google button when configured, plus "Continue with email", which opens an email form in a
  sheet. A sent code opens the code screen. Include Terms and Privacy links.
- Empty states: a hairline construction drawing (circle + golden rectangle + spiral) in `muted`,
  ~170dp, then a mono label with the real count (`0 WORKOUTS`), one plain line ("No workouts logged
  yet."), at most one ink action. Rendered with react-native-svg.
- Record toast: floating surface, ember mark-dot or star-free glyph (use a small ember dot, not a star),
  text "Bench press personal record: 102.5 kg × 5". One success haptic, no confetti.
- Share cards: Sigil cards use two inks,
  ember only for records, mark A2 in the footer, keep story-safe insets and the photo/sticker modes.
  No lifetime counters, no barcodes.

## Website (apps/web)

- The homepage opens with the Atlas photograph, construction drawing, interactive SIGIL wordmark
  and Android APK link. Nonfinito covers ownership of the training log. The paper section uses real
  app screenshots to illustrate the Program rotation and set logging, and describes progression.
- Noise and Tech Text come from React Bits. Both are client-side enhancements with reduced-motion
  fallbacks. Photo attribution lives in the repository README.
- `/screens` holds the full app captures. Legal pages use the same type and colours.

## Voice

Plain, short, stoic; never cosplay. Keep the app's term "personal record". Examples:
"Log your sets and see what you lifted last time." · "No workouts logged yet." ·
"Your personal records will appear here." · "Bench press personal record: 102.5 kg × 5."
"Earn the mark." appears on sign-in and at the close of the site.
