# Design

The Vermillion design system. Tokens live in `packages/ui/src/tokens/brand.ts`; see Implementation for how they reach native and email.

> The public site (`apps/web`) uses a fixed monochrome palette. The **Web** and coss / shadcn examples below are references for a future companion app; they do not describe the public site.

## Native appearance

Native has two modes and six accents. The mode is **System** (the default), **Light** or **Dark**; the accent is **Acid** (the default), **Gold**, **Ember**, **Rose**, **Ice** or **Mono**. Both are chosen in Settings → Appearance. The redesign spec is
[docs/design/redesign-2026-11/SPEC.md](docs/design/redesign-2026-11/SPEC.md); where this file disagrees with it, the spec wins.

- **Dark is true AMOLED**: canvas `#000000`, near-black raised surfaces (`#0A0A0A` cards, `#141414`
  floating sheets, `#1C1C1C` controls), hairline borders, neutral (untinted) greys, white ink.
  **Light is pure white**: canvas `#FFFFFF`, cards `#F5F5F5`, neutral greys, near-black ink.
  Both have the same structure and live in `packages/ui/src/tokens/themes/palette.ts`.
- **The accent** is the only hue in the interface. Each accent has a **fill** (`action`) that stays bright
  in both modes, a **text tone** (`accent-text`) that darkens in light mode, and a label colour for
  the fill (`on-action`). Mono is white on dark and black on light, its text equal to its fill. It is used for
  primary buttons, the current set, completed set rows, records and PRs, the selected tab and
  chips, and the primary chart series. Never large surfaces.
- **Red (`danger`) is the only status colour**, for destructive actions and errors, always with an
  icon and words. There is no success colour (a positive state is the accent) and no warning
  colour (a warning is neutral text with an icon). HeroUI's `success` and `warning` variables
  alias the accent and neutral text so its components keep working. The ember, `brand-detail`,
  lichen (`set-done`) and macro roles are gone.
- Saved theme ids from earlier versions (`sigil`, `classic`, `patina`, `oxide`, `slate`, `mulberry`,
  unknown), the retired accents (Lime, Teal, Blueberry, Lavender) and the removed contrast setting, migrate to the default accent; the saved mode is kept.
  `nativeColors` in `brand.ts` holds every variant (`ember-dark`, `acid-light`, …); the built-in
  `light` and `dark` carry Acid. Email uses those.
- `device.theme` stores `{ appearance, accent }`. Native chrome, status bars and blur use
  `useThemeMode()`.
- Geist sets native text, including large titles and the sign-in wordmark. Geist Mono sets labels
  and code. Weights, reps, durations and every numeric column use tabular figures.
- Brand images (icon, adaptive and notification icons, splash, graded sign-in photo) are generated
  by `pnpm brand:assets`. Sign-in is always dark. Empty states show a muted Phosphor icon
  with a mono count label, one plain line and at most one action.

See the [native themes guide](docs/guides/native-themes.md).

## Overview

Vermillion is a precise, quiet tool for training and nutrition. It is built on tinted surface steps, spaced groups, tight corners, Geist with tabular figures, one accent that means "you / now" and one primary action per screen, plus what a phone-first fitness app needs: color as data, big numbers, touch sizes for sweaty hands, motion, and haptics.

Platforms: iOS and Android via React Native + Expo + HeroUI Native. A web companion is a later decision. One token source (`packages/ui/src/tokens/brand.ts`) feeds native and email.

### Principles

1. **Numbers are the headline.** Weight, reps and durations get the biggest type on screen, set in tabular figures.
2. **Color is meaning, never decoration.** Neutrals carry the interface; the accent marks what is yours or current, fills the primary action and tints completed sets. Red is the only status colour. Set kinds and secondary chart series take quiet categorical tones. Everything else is neutral.
3. **One loud thing per screen.** At most one filled primary button (the accent) in any view.
4. **Quiet surfaces, clear groups.** Depth comes from surface steps, rounded corners and spacing. Only floating layers add shadows.
5. **Designed for the gym, not the desk.** Active mode gives 56–64pt targets, giant numbers and haptic confirmation for the moments your hands are busy.
6. **Celebrate once, then get out of the way.** PRs and streaks get one expressive moment; nothing loops or blocks.
7. **Role tokens only.** Components reference roles (`surface`, `text-primary`), never hex values, so light and dark mode come from the same code.

### Foundations at a glance

| Area     | Rule                                                                                       |
| -------- | ------------------------------------------------------------------------------------------ |
| Modes    | System (default), Light (pure white) or Dark (AMOLED black)                                |
| Accent   | Acid (default), Gold, Ember, Rose, Ice or Mono                                             |
| Action   | The accent fill is the one primary button; accent text uses `accent-text`                  |
| Color    | Accent = you / now / done; `chart-1` is the accent, `chart-2`…`5` are quiet; danger is red |
| Surfaces | Four steps, spaced for phone screens                                                       |
| Depth    | No shadows except floating layers and the button keycap edge                               |
| Controls | 44pt Standard, 56–64pt Active                                                              |
| Type     | Geist, Geist Mono for code, `tnum`, numeric display tier up to 72pt                        |
| Radius   | 4/8/12/16/28                                                                               |
| Motion   | Full motion and haptic token sets                                                          |

## Decision log

Fourteen decisions; the first twelve settled in the grilling session on 8 Nov 2026, the rest the same day. Change one only by updating this table and every section it touches.

| #   | Decision          | Choice                                                                                                | Why                                                                                                 |
| --- | ----------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 1   | Primary platform  | Phone-first native, web later                                                                         | Sets and meals are logged in the moment, on a phone                                                 |
| 2   | Color modes       | System / Light (pure white) / Dark (AMOLED black), plus six accents, role-based tokens               | Bright gyms and a true-black dark mode for OLED; one accent axis instead of whole themes (Nov 2026) |
| 3   | Primary action    | The accent fill with its own label colour (`on-action`)                                               | One loud thing per screen, in the person's colour                                                   |
| 4   | Status colors     | Red for danger only; no success, warning or macro colours                                             | The accent already means "good"; warnings are neutral text and an icon (Nov 2026)                   |
| 5   | Number typeface   | Geist for numbers                                                                                     | `tnum` aligns digits across tables and timers                                                       |
| 6   | Density           | Two densities: Standard + Active                                                                      | Mid-workout use needs bigger targets than planning screens                                          |
| 7   | Radius            | 4 / 8 / 12 / 16 / 28 + full                                                                           | Precise corners, one step softer for phones                                                         |
| 8   | Depth             | No shadows except floating layers                                                                     | Filled cards; sheets need separation in light mode                                                  |
| 9   | Motion            | Fast and functional, expressive only for celebrations                                                 | No bounce on repeated actions; PRs feel earned                                                      |
| 10  | Icons             | Phosphor (Regular / Bold / Fill)                                                                      | Weights map onto Standard, Active and selected states                                               |
| 11  | Charts            | Clean and minimal, color = meaning                                                                    | Smoothed weight trend, highlight PRs and today with weight and labels, not a hue                    |
| 12  | Stack             | Expo + HeroUI Native; web deferred                                                                    | One token source, a native adapter and the email templates (see Implementation)                     |
| 13  | Navigation shell  | Floating icon-only tab pill that morphs into a menu panel, collapsing page header (ADR 0028, amended) | Linear-like and thumb-first; the tab count can grow to five without a redesign                      |
| 14  | Native components | HeroUI Native base; missing parts copied in from PanelUI / Reacticx (ADR 0030)                        | No second icon set or peer-dependency tree; every copy restyled to tokens                           |

## Color

Every color is a role with a dark and a light value; components never reference a hex. All text pairs below are held to WCAG 2.1 by `theme-rules.test.ts` on every accent in both modes: 4.5:1 for text, 3:1 for icons and graphics.

The neutrals are the same under every accent; the accent changes only `action` and what is derived from it.

### Surfaces and lines

| Role               | Dark      | Light     | Use                                                   |
| ------------------ | --------- | --------- | ----------------------------------------------------- |
| `canvas`           | `#000000` | `#FFFFFF` | Screen background (true AMOLED black, pure white)     |
| `surface`          | `#0A0A0A` | `#F5F5F5` | Cards                                                 |
| `surface-control`  | `#1C1C1C` | `#EBEBEB` | Inputs, steppers, inactive chips, ring and bar tracks |
| `surface-floating` | `#141414` | `#FFFFFF` | Sheets, toasts, floating timer bar                    |
| `hairline`         | `#1F1F1F` | `#E5E5E5` | Hairline borders, input and selected-option outlines  |
| `hairline-strong`  | `#383838` | `#C8C8C8` | Focused inputs and selected options                   |
| `backdrop`         | black 60% | black 30% | Dimming behind sheets and dialogs                     |

### Text

| Role             | Dark      | Light     | Use                                            |
| ---------------- | --------- | --------- | ---------------------------------------------- |
| `text-primary`   | `#FFFFFF` | `#0A0A0A` | Titles, numbers, ink                           |
| `text-secondary` | `#D4D4D4` | `#404040` | Body copy                                      |
| `text-muted`     | `#A1A1A1` | `#545454` | Hints, units, metadata                         |
| `text-disabled`  | `#5C5C5C` | `#A3A3A3` | Decorative only, never sole carrier of meaning |

### Accent

The accent has a **fill** and a **text tone**. `action` is the fill (primary buttons, ticks, the completed-row tint, selected chips, chart lines, the current-set bar); it stays bright in both modes. `accent-text` is the accent as text or icon colour on the canvas (links, the current set number, small labels, a check icon); it darkens in light mode so it reads at 4.5:1 on `canvas` and `surface`. `on-action` is the label on the fill (4.5:1). Never put `action` text on the canvas: use `text-accent-text` (HeroUI: `--accent` is the fill, `--color-accent-text` the tone).

| Accent         | Fill (both modes)     | `accent-text` dark | `accent-text` light | `on-action`           |
| -------------- | --------------------- | ------------------ | ------------------- | --------------------- |
| Acid (default) | `#A3FF12`             | `#A3FF12`          | `#3B7000`           | `#0A0A0A`             |
| Gold           | `#FFC83D`             | `#FFC83D`          | `#8A5A00`           | `#0A0A0A`             |
| Ember          | `#FF6B3D`             | `#FF6B3D`          | `#B33A12`           | `#0A0A0A`             |
| Rose           | `#FF5C8A`             | `#FF5C8A`          | `#B8124A`           | `#0A0A0A`             |
| Ice            | `#9BE6FF`             | `#9BE6FF`          | `#0B6A8A`           | `#0A0A0A`             |
| Mono           | `#FFFFFF` / `#000000` | `#FFFFFF`          | `#000000`           | `#000000` / `#FFFFFF` |

Ember and Rose sit near red: destructive actions always carry an icon and words, never colour alone.

`action-hover` and `action-pressed` move the fill away from its label, and `accent-soft-text` is the accent moved toward the ink until it is readable on HeroUI's 20% soft fill. `focus-ring` is `text-primary`.

The accent is used only for primary buttons, the current set, completed set rows (the whole row tinted with the fill at 15%, with the check filled), records and PRs, the selected tab and chips, and the primary chart series. Never a large surface.

### Status

| Role     | Dark      | Light     | Rule                                                               |
| -------- | --------- | --------- | ------------------------------------------------------------------ |
| `danger` | `#FF5A5F` | `#C62828` | Destructive actions and errors only; always icon + words           |
| (none)   |           |           | No success colour: a positive state is the accent                  |
| (none)   |           |           | No warning colour: a warning is `text-secondary` text plus an icon |

HeroUI still reads `--success` and `--warning`; they alias the accent and `text-secondary` so its Alerts and Toasts keep working. Do not use them to mean anything else.

### Data colors

- **Charts:** `chart` and `chart-1` are the accent. `chart-2`…`chart-5` are quiet categorical tones (steel, sand, sage, mauve) for secondary series, each 3:1 against `canvas` and `surface`.
- **Set kinds:** `set-warmup`, `set-drop`, `set-failure`, `set-top`, `set-backoff` and `set-myo` colour a small tag and stay readable (4.5:1) on `canvas`, `surface` and a completed row.
- **Plates:** `plate-*` are physical objects, the same in every theme.

### Color rules

- One filled primary (`action`) button per screen, at most. No other hue marks an action.
- Danger is red, never the accent, and never the only signal.
- Numbers on a completed set row stay at full contrast; only the row tint and the check carry the accent.
- A Mono accent keeps the same rules: its tint is a grey, so the check and the primary button carry the meaning.

## Typography

Geist is the primary typeface, including the large numeric tier. Geist Mono sets inline code. See [ADR 0051](docs/adr/0051-geist-typeface.md).

### Font setup

- Native loads Geist 400 / 500 / 600 / 700 and Geist Mono 400 / 500 before hiding the splash screen. HeroUI Native's four weight utilities select the matching Geist faces. Use `font-mono` for Geist Mono regular or `font-mono-medium` for medium.
- Apply `tabular-nums` to numeric text. It maps to `fontVariant: ['tabular-nums']` in React Native and requests equal-width digits from Geist's `tnum` feature.
- **Accessibility:** keep system text scaling on. Cap `numeric-hero` and `numeric-xl` at 1.3× so a giant timer can't overflow the screen.

### Text scale (UI)

| Token         | Size / line | Weight | Tracking        | Use                                     |
| ------------- | ----------- | ------ | --------------- | --------------------------------------- |
| `title-xl`    | 28 / 34     | 600    | -0.3            | Screen titles (Today, Workouts)         |
| `title-lg`    | 22 / 28     | 600    | -0.2            | Sheet titles, section headers           |
| `title-md`    | 18 / 24     | 600    | -0.1            | Card titles, exercise names             |
| `body-lg`     | 17 / 24     | 400    | 0               | Recipe steps, longer reading            |
| `body`        | 15 / 22     | 400    | 0               | Default text                            |
| `body-strong` | 15 / 22     | 500    | 0               | Emphasis, list item titles              |
| `label`       | 13 / 18     | 500    | +0.1            | Buttons (Standard), chips, field labels |
| `caption`     | 12 / 16     | 400    | +0.2            | Metadata, timestamps                    |
| `overline`    | 11 / 14     | 600    | +0.6, uppercase | Group labels (PROTEIN, TODAY)           |

Button labels in Active mode use `body-strong` at 17pt.

### Numeric tier

Use `tnum` throughout the numeric tier.

| Token          | Size / line | Weight | Tracking | Use                            |
| -------------- | ----------- | ------ | -------- | ------------------------------ |
| `numeric-hero` | 72 / 76     | 600    | -1.5     | Rest timer, calories remaining |
| `numeric-xl`   | 48 / 52     | 600    | -1.0     | Current set weight × reps      |
| `numeric-lg`   | 32 / 36     | 600    | -0.5     | Daily totals, body weight      |
| `numeric-md`   | 20 / 24     | 500    | -0.2     | Values in cards, set history   |
| `numeric-sm`   | 15 / 20     | 500    | 0        | Table cells, chart axis labels |

### Unit rule

The value is big and bright; the unit is about half the size, in `text-muted`, sitting on the same baseline. "142 g", "82.4 kg", "1,840 kcal". Use a thin space between number and unit, and the locale's decimal separator.

### Typography rules

- Numbers never use proportional figures anywhere in the app.
- No more than two text sizes inside one card, plus one numeric size.
- Sentence case for all UI text; uppercase only for `overline`.

## Spacing, layout and density

Spacing runs on a 4pt base, and every interactive component comes in two sizes: `standard` everywhere, `active` only on the live workout screen.

### Spacing scale

| Token       | Value | Typical use                                  |
| ----------- | ----- | -------------------------------------------- |
| `space-0.5` | 2     | Hairline gaps, icon-to-badge                 |
| `space-1`   | 4     | Number-to-unit, tight inline gaps            |
| `space-2`   | 8     | Icon-to-label, chip gaps                     |
| `space-3`   | 12    | Gap between list rows and stacked cards      |
| `space-4`   | 16    | Screen side padding, card padding (Standard) |
| `space-5`   | 20    | Card padding (Active), sheet padding         |
| `space-6`   | 24    | Gap between groups inside a screen           |
| `space-8`   | 32    | Gap between screen sections                  |
| `space-12`  | 48    | Top of empty states, big separations         |

These map one-to-one onto Tailwind's spacing utilities (`p-4` = 16), which both HeroUI Native and coss ui use, so no custom spacing config is needed.

### Layout

- **Screen padding:** 16pt sides; respect safe areas top and bottom on every screen, sheet and toast.
- **Tab bar:** a floating, icon-only pill, a fixed 56pt tall, 8pt above the bottom safe area, on level 3 depth with no outline (floating surfaces rely on the layer step and shadow). It holds the direct tabs (the tab bar's `directTabCount`; Vermillion sets one, Home) and a menu slot that shows `CaretUpDown`, or, while a menu screen is open, that screen's icon. The active tab is a capsule: `surface-control` fill with a `text-primary` Fill icon, and a small accent dot beneath. Tap the menu slot, or press and slide up to pick a row (a `haptic-tick` per row): the pill morphs into a panel with the same left edge, widening up to the compose button. The panel lists every tab route (up to five in all: today Home, Exercises, Settings; later Today, Train, Eat, Progress, You) under the account header. No dim backdrop. Content fades into the canvas under the bar. The bar hides while the keyboard is up.
- **Tab action:** the open tab's one main action (New exercise) is a 56pt round `action` (accent) button with an `on-action` icon to the right of the pill, inside thumb reach; tabs without one show nothing there.
- **Page header:** a `title-xl` title, left-aligned at the top of the content, scrolls away; an opaque `canvas` band fades in with a compact, left-aligned title (`body`, 600) beside the back button and a soft ~30pt gradient edge into the content (no blur at the top). Content under the floating tab bar melts into the canvas through one eased SVG gradient owned by the tab bar (no blur library: the native blur view crashed Android release builds). Tap the title to scroll to the top. Pushed pages add a round back button; page actions sit in a floating capsule on the right.
- **Live workout bar:** while a session runs, a floating bar sits above the tab bar on every screen showing elapsed time and the rest timer, on `surface-floating` with `text-primary`.
- **Reach:** primary actions live in the bottom half of the screen, inside thumb reach; destructive actions never sit where the thumb rests.
- **Keyboard:** food search and number entry keep the primary action above the keyboard.
- **Tablets and web:** content max width 640pt for forms and logging; dashboards may use a 2–3 column grid up to 1200px.

### Standard vs Active

| Property              | Standard                    | Active (live workout)                                                     |
| --------------------- | --------------------------- | ------------------------------------------------------------------------- |
| Minimum touch target  | 44pt                        | 56pt; 64pt for +/- and Log set                                            |
| Primary button height | 48pt                        | 60pt, full width                                                          |
| Card padding          | 16                          | 20                                                                        |
| Body text             | `body` 15pt                 | `body-lg` 17pt                                                            |
| Key number            | `numeric-md` / `numeric-lg` | `numeric-xl` / `numeric-hero`                                             |
| Icons                 | 20pt, Phosphor Regular      | 24–28pt, Phosphor Bold                                                    |
| Elements per screen   | Normal                      | Current exercise, current set, timer, next set; everything else collapsed |
| Screen                | Normal sleep                | Kept awake                                                                |
| Haptics               | On key actions              | On every logged set, +/-, timer end                                       |

Rule: a component reads its size from a `density` context, not from a prop on every call. The workout screen wraps its tree in `density="active"`.

## Radius

Five steps, 4 / 8 / 12 / 16 / 28, plus full; buttons are rounded rectangles, pills are only for chips.

| Token         | Value | HeroUI Native (`--radius: 8px`)                               | Use                                                 |
| ------------- | ----- | ------------------------------------------------------------- | --------------------------------------------------- |
| `radius-xs`   | 4     | `rounded-sm`                                                  | Badges, tags, chart bars                            |
| `radius-sm`   | 8     | `rounded-lg`                                                  | Small chips, inputs nested in cards, app-icon tiles |
| `radius-md`   | 12    | `rounded-xl`; set `--field-radius: calc(var(--radius) * 1.5)` | Buttons, inputs, set rows, steppers                 |
| `radius-lg`   | 16    | `rounded-2xl`                                                 | Cards                                               |
| `radius-xl`   | 28    | `rounded-[28px]` (custom; sits between HeroUI's 24 and 32)    | Top corners of bottom sheets                        |
| `radius-full` | 9999  | `rounded-full`                                                | Filter chips, avatars, progress rings, toggles      |

**Nested corners:** inner radius = outer radius − the padding between them. A row inside a 16pt card with 4pt inset gets 12; with 8pt inset it gets 8. Never put a larger radius inside a smaller one.

**Web:** shadcn/coss derive their radius steps from one `--radius` variable. Set `--radius: 0.75rem` (12px) so buttons land on 12 and cards on 16, then check the derived `sm`/`md` steps against this table in your installed version, because the formula has changed between shadcn releases.

## Depth

Native cards and row groups use canvas/surface/control fills, rounded corners and spacing, with no divider lines or card outlines. Keep outlines for fields and selected chips, swatches or option tiles; diagram strokes, chart axes and progress tracks remain. Review row padding, group gaps and visible pressed feedback whenever removing a line.

| Level      | Dark                                           | Light                                                                                                                     | Use                                              |
| ---------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| 0 Canvas   | `canvas`                                       | `canvas`                                                                                                                  | Screen background, section headers               |
| 1 Card     | `surface`                                      | `surface`                                                                                                                 | All cards                                        |
| 2 Control  | `surface-control`, no border (border on focus) | same                                                                                                                      | Inputs, steppers, tracks inside cards            |
| 3 Floating | `surface-floating` + `backdrop`                | `surface-floating` + shadow `0 -4 24 rgba(0,0,0,0.10)` (sheets) or `0 8 24 rgba(0,0,0,0.12)` (toasts, menus) + `backdrop` | Sheets, dialogs, toasts, menus, live workout bar |

**Selection and lift** use the surface step, not shadow: a selected chip or row moves from `surface` to `surface-control`; the live set row moves to `surface-control` and adds a 3pt `text-primary` leading edge.

**HeroUI Native override:** remove card shadows and outlines, and use a `surface` fill. Floating controls keep `shadow-overlay` and their filled shape, without an outline.

**Web:** same rule; remove `shadow-sm`/`shadow-xs` from coss/shadcn `Card` and keep shadows only on `Popover`, `Dialog`, `Sheet`, `Menu` and `Toast`.

## Motion and haptics

Motion is fast and functional; only celebrations are expressive, and they play once.

### Motion tokens

| Token              | Value                                                                                                                     | Use                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `motion-fast`      | 120ms, ease-out                                                                                                           | Presses, toggles, chip selection, checkmarks                      |
| `motion-base`      | 200ms, ease-out                                                                                                           | Elements appearing, rows expanding, tab content                   |
| `motion-slow`      | 320ms, ease-in-out                                                                                                        | Rings filling, chart transitions, number count-ups                |
| `motion-sheet`     | Spring: damping 39, stiffness 600, mass 0.7, ζ = 0.95, no overshoot (about 180ms)                                         | Sheets, dialogs, the tab pill's morph into its panel              |
| `motion-page`      | 150-180ms: stacks slide from the right (pop reverses, swipe back anywhere); tabs slide ~28% of the width, direction-aware | Navigation between pages and tabs                                 |
| `motion-celebrate` | \~800ms, one time                                                                                                         | PR, streak, workout finished: a white diagonal stripe sweeps once |

On React Native these run through Reanimated, which HeroUI Native already uses; customize component motion with its `animation` prop rather than overriding styles. Spring values above are starting points to tune on device.

### Haptic tokens (`expo-haptics`)

| Token            | Expo call                                 | Use                                                                         |
| ---------------- | ----------------------------------------- | --------------------------------------------------------------------------- |
| `haptic-tick`    | `selectionAsync()`                        | Ticking a set, +/- weight and reps, picker scroll, chip select, chart scrub |
| `haptic-confirm` | `impactAsync(Medium)`                     | Set logged, meal logged, item saved                                         |
| `haptic-success` | `notificationAsync(Success)`              | Workout finished, PR                                                        |
| `haptic-alert`   | `notificationAsync(Warning)`, repeated 3× | Rest timer finished                                                         |

### Motion rules

- Navigation is smooth, not instant: tabs and pushed pages slide in the direction of travel (`motion-page`).
- Nothing bounces during repeated actions.
- Celebrations never loop, never block input, and can be skipped with a tap.
- With the system's Reduce Motion setting on, every animation becomes a 120ms fade; haptics stay.
- Numbers that change count up over `motion-slow` only on summary screens, never while logging.
- The rest timer's final 3 seconds pulse the timer text once per second, not the whole screen.
- Motion is feedback, never decoration. It belongs in these places only: the set-complete check
  (a scale pop plus `haptic-success`), set rows entering and leaving (layout transitions), goal
  rings and calendar days filling when they change, stat numbers rolling, and sheets and dialogs on
  `SHEET_SPRING`.
- Data read from the local database never shows a skeleton: content fades in over about 150ms.
  Static block skeletons (no shimmer) are only for real network waits.

## Iconography

Phosphor Icons everywhere: `phosphor-react-native` on native, `@phosphor-icons/react` on web. coss ui and shadcn ship with Lucide by default; swap those imports so web and native share one icon language.

| Context                      | Weight  | Size            |
| ---------------------------- | ------- | --------------- |
| Inline and standard UI       | Regular | 20pt            |
| Navigation, headers, tabs    | Regular | 24pt            |
| Selected tab, selected state | Fill    | same as context |

- Two sizes only: 20 and 24. Larger glyphs belong to empty states and illustrations.
- Only Regular and Fill. No Bold, Thin, Light or Duotone.
- No emoji or text glyphs (`›`, `×`, `+`, `↑`, `→`, `·` used as an icon) in place of an icon.
- Every icon-only button has an accessible label.

### Icon color

- Default `text-secondary`; inactive tabs `text-muted`; selected tab `text-primary` + Fill weight.
- The primary button's icon takes `on-action`.

### Core icon map

| Concept             | Phosphor icon |
| ------------------- | ------------- |
| Today tab           | `SunHorizon`  |
| Train tab, exercise | `Barbell`     |
| Eat tab, meal       | `ForkKnife`   |
| Progress tab        | `ChartLineUp` |
| You tab             | `UserCircle`  |
| Home tab (template) | `SunHorizon`  |
| Settings            | `GearSix`     |
| Tab switcher        | `CaretUpDown` |
| Calories            | `Fire`        |
| Streak              | `Lightning`   |
| PR                  | `Trophy`      |
| Rest timer          | `Timer`       |
| Recipe              | `CookingPot`  |
| Barcode scan        | `Barcode`     |
| Water               | `Drop`        |
| Body weight         | `Scales`      |
| Measurements        | `Ruler`       |
| Progress photo      | `Camera`      |

Keep this table as the single source; never use two icons for one concept.

Exercise demonstrations and muscle-group body maps are out of scope for the icon set; see Known gaps.

## Data visualization

Charts are minimal and color carries meaning: the primary series is the accent (`chart`) and secondary series are quiet tones; PRs and today stand out by brightness, not hue. Red is never a chart color.

| Chart                | Spec                                                                                                                                         |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Calorie ring         | Track `surface-control`, fill `text-primary`, 14pt stroke, round caps, starts at 12 o'clock; centre shows calories remaining in `numeric-lg` |
| Rings or bars        | Track `surface-control`, fill the accent, 8pt stroke (rings) or 6pt (bars); value + target always shown beside it                            |
| Over target          | Ring stays full; a 2pt tick marks the overflow, label "+12 g" in `text-secondary`; never `danger`                                            |
| Goal hit             | Small accent check beside the value                                                                                                          |
| Line series          | 2pt accent line over a faint accent area (12%); a dashed `text-primary` reference line at the best value (the PR); latest point a 3pt dot    |
| Body weight          | Daily weigh-ins as 4pt dots in `text-muted`; 7-day moving average as the 2pt line                                                            |
| PR markers           | 8pt `text-primary` dot with `Trophy` on tap                                                                                                  |
| Bars                 | Volume, distance and counts: accent bars, `radius-xs` tops; the scrubbed bar stays full, the rest dim; goal as dashed 1pt `hairline-strong`  |
| Grid and axes        | At most four horizontal gridlines, 1px `hairline`; no chart border; labels `numeric-sm` in `text-muted`                                      |
| Aggregation          | One point per session over three months, one per week over a year or all time (best of the week, or the total for volume and counts)         |
| Scrub                | Tap and drag shows a cursor line and a floating tooltip with the value and date, with a `haptic-tick` per point                              |
| Line or bars         | Lines for e1RM, duration and pace; bars for volume, distance and counts. Pace plots seconds per kilometre with faster drawn higher           |
| Human units          | Durations `40:00` / `1:05:00`; distance `7.0 km`, `850 m` under 1 km; pace `5:43 /km`; never metres per second or bare seconds               |
| Empty or sparse data | Below 3 points, show the values as a list plus "Log 2 more to see a trend"                                                                   |

### Libraries

- **Native:** a Skia-based chart library (Victory Native XL is the common choice) for rings, lines and bars; simple rings can be plain `react-native-svg`.
- **Web:** shadcn charts (Recharts). Map `--chart-1` protein, `--chart-2` carbs, `--chart-3` fat, `--chart-4` neutral trend (`text-primary`), `--chart-5` `text-muted` (secondary series).

### Chart rules

- Every chart has a plain-language summary for screen readers ("Weight trend: down 1.2 kg over 4 weeks").
- Tapping a point shows its exact value in a tooltip on `surface-floating`.
- Time ranges: 1W, 1M, 3M, 1Y, All, as a pill-tab chip row.

## Components

Start from HeroUI Native (native) and coss ui (web) and restyle them with tokens; build custom components only for fitness-specific jobs. Every interactive component has `standard` and `active` sizes and these states: default, pressed, focused, disabled (50% opacity, HeroUI's default), loading.

### Buttons

| Variant     | Look                                                                                       | HeroUI Native | coss / shadcn | Use                                              |
| ----------- | ------------------------------------------------------------------------------------------ | ------------- | ------------- | ------------------------------------------------ |
| Primary     | `action` fill, `on-action` label; inset top highlight, bottom shade, soft glow in dark     | `primary`     | `default`     | One per screen: Start workout, Log set, Add food |
| Secondary   | Faint top-to-bottom gradient, 1px ring (25% white in dark, 50% on hover), inset highlights | `secondary`   | `secondary`   | Alternatives: Add exercise, Edit                 |
| Outline     | Same as secondary                                                                          | `outline`     | `outline`     | Inside cards                                     |
| Ghost       | No fill, `text-secondary`; `surface-control` on hover                                      | `ghost`       | `ghost`       | Low emphasis: Skip, Cancel                       |
| Destructive | `danger` text on a faint rose tint with a rose 1px ring; confirm step                      | `danger-soft` | `destructive` | Delete workout, remove food                      |

Shape: `radius-sm` (8) corners, `label`-size text (14 / 500, +0.2 tracking), 16pt icons, 8pt gap. Web: 36px tall with 12px side padding (`sm` 32, `lg` 40), and touch pointers get a 44px hit area; native: 44pt tall. Pressed scales to 98%; hover and press change fill or ring over 200ms. Disabled is 30% opacity on web. The shadows live as `--button-*` variables per theme in `packages/ui/src/styles/globals.css`. Active mode buttons are 60pt and full width. Loading keeps the label width and shows a spinner in place of the icon. Never use HeroUI's filled `danger` variant.

### HeroUI Native and coss components to restyle

| Need              | Native (HeroUI)       | Web (coss)               | Vermillion notes                                                                  |
| ----------------- | --------------------- | ------------------------ | --------------------------------------------------------------------------------- |
| Card              | `Card`, `Surface`     | `Card`                   | `surface` fill, `radius-lg`, no outline or shadow                                 |
| Text input        | `Field` (platform/ui) | `Input`, `Field`         | `surface-control`, `radius-md`, focus = `hairline-strong` border, no colored ring |
| Chips and filters | `Chip`                | `Toggle Group`, `Badge`  | `radius-full`; selected = `surface-control` + `text-primary`                      |
| Segmented tabs    | `Tabs`                | `Tabs`                   | Time ranges, meal slots                                                           |
| Sheet             | `BottomSheet`         | `Sheet`, `Drawer`        | `radius-xl` top corners, level 3 depth                                            |
| Dialog            | `Dialog`              | `Dialog`, `Alert Dialog` | Destructive confirms only                                                         |
| Toast             | `Toast`               | `Toast`                  | `surface-floating`; "Set logged · Undo"                                           |
| Toggle            | `Switch`              | `Switch`                 | On = `text-primary` track                                                         |
| Checkbox          | `Checkbox`            | `Checkbox`               | Set complete check = filled with the accent (`bg-accent`, `on-action` tick)       |

### Custom fitness components

| Component          | Anatomy                                                                              | Key rules                                                                                                                                                                                                                                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SetRow`           | Set number · previous (muted) · weight · reps · RPE (optional) · check               | Live row: 3pt accent leading edge and accent set number; done row: the whole row tinted with the accent at 15% (rounded, full width), check filled with the accent, numbers at full contrast; the tint fades in over 180ms (instant under Reduce Motion) with a `haptic-tick`; swipe left to delete with undo |
| `NumberStepper`    | − button · value (`numeric-md`/`numeric-xl`) + unit · + button                       | Tap value to type; long-press +/− repeats; `haptic-tick` per step; increments from user settings (2.5 kg / 5 lb)                                                                                                                                                                                              |
| `RestTimer`        | Ring · `numeric-hero` countdown · −15s / +15s / Skip                                 | Lives in the live workout bar when collapsed; `haptic-alert` at zero                                                                                                                                                                                                                                          |
| `LiveWorkoutBar`   | Exercise name · elapsed · rest countdown                                             | Floating above tab bar on every screen while a session runs; tap to return                                                                                                                                                                                                                                    |
| `MacroSummary`     | Calorie ring + three macro bars (P, C, F) with value / target                        | Fixed order P, C, F; values always visible                                                                                                                                                                                                                                                                    |
| `MealSlotCard`     | Slot name · kcal total · food rows · Add                                             | Breakfast, Lunch, Dinner, Snacks; empty state is a single Add row                                                                                                                                                                                                                                             |
| `FoodRow`          | Name · serving · kcal · P/C/F mini values                                            | Tap to edit serving; macro letters in macro text colors                                                                                                                                                                                                                                                       |
| `ExerciseCard`     | Name · muscle tag · set rows · Add set                                               | Accordion: tap the header to open or close (there is no chevron); tap the thumbnail for exercise detail; the ⋮ menu (with "View exercise") shows on every header; collapses to one summary line when done                                                                                                     |
| `PRBadge`          | `Trophy` + "PR" in `text-primary` on `surface-control`                               | Triggers `motion-celebrate` once when first earned                                                                                                                                                                                                                                                            |
| `OtpInput`         | One cell per digit (56pt tall, `radius-lg`, `surface-control`) over one hidden input | Digits in `numeric-md`; focus = `hairline-strong` border, error = `danger` border plus a message; autofill and paste fill every cell, the last digit submits                                                                                                                                                  |
| `SearchBar`        | 44pt `surface-control` field · magnifier · clear button                              | Shown only when there is something to search; filters the local list as you type; no results is an `EmptyState`, not a blank list                                                                                                                                                                             |
| `SegmentedControl` | `surface-control` track · `surface` pill on the selected option                      | Two to four options in one view (theme); pill slides in `motion-fast`; `haptic-tick` on change; use `Chip`s for filters, `ListRow` pickers beyond four options                                                                                                                                                |
| `Skeleton`         | `surface-control` blocks shaped like the content, pulsing opacity                    | First load only (the list's rows, 48pt); still under Reduce Motion; never for a spinner-length wait or for errors                                                                                                                                                                                             |
| `NumberFlow`       | Tabular digits that roll to a new value                                              | `motion-slow`; Reduce Motion swaps digits; the value sets the text style (`numeric-*`), the unit is separate                                                                                                                                                                                                  |
| `StatTile`         | `overline` label · `numeric-lg` value + unit · change vs last period                 | Change shown neutral: "−0.8 kg" in `text-secondary`, no red/green judgement                                                                                                                                                                                                                                   |
| `EmptyState`       | Phosphor icon (48pt, `text-muted`) · one line · one primary action                   | Never more than one sentence                                                                                                                                                                                                                                                                                  |
| `SwipeRow`         | Row content · actions revealed on a left swipe                                       | Outermost action fires on a full swipe, with a `haptic-tick` at the threshold; destructive actions are rose on a 15% rose tint; the same actions are screen-reader actions and a long-press sheet                                                                                                             |
| `ListSection`      | `overline` label · `surface` card of padded rows without dividers                    | Settings and pickers; rows show their current value in `text-muted` and a chevron, check or nothing on the right                                                                                                                                                                                              |

### Accessibility (all components)

- Every icon-only button has an accessibility label ("Increase weight by 2.5 kilograms").
- `SetRow` announces as "Set 2, 80 kilograms, 8 reps, completed".
- Timers announce at 10 seconds and at zero, not every second.
- Selected and completed states are conveyed by icon and label, never color alone.

## Patterns

Four core flows and the onboarding flow, each built only from the components above.

### Workout logging (Active mode)

1. Train tab: pick a routine or Start empty workout (the screen's one primary button).
2. The workout screen switches to `density="active"`, keeps the screen awake and shows the `LiveWorkoutBar` app-wide.
3. The current `ExerciseCard` is expanded; the next set is the live `SetRow`, prefilled from last session (previous values shown muted).
4. Adjust with `NumberStepper`s, tap the check: `haptic-confirm`, row turns done, `RestTimer` starts automatically.
5. Timer hits zero: `haptic-alert`; the next set becomes live.
6. Finish workout (primary) → summary sheet with volume, duration and any PRs, which trigger `motion-celebrate` once.

Rules: one tap to log a set that matches the plan; nothing in the flow needs typing; undo is always offered by toast instead of confirm dialogs.

### Food and macro logging (Standard mode)

> Deferred. The redesign removed the macro colours; macro graphics will be neutral or accent until nutrition is designed again.

1. Eat tab opens on `MacroSummary` (calories remaining as the hero number) and the day's `MealSlotCard`s.
2. Add food (primary) opens a sheet with search, Recent, Saved meals and Barcode.
3. Picking a food shows serving size with a `NumberStepper` and a live preview of how the day's macro bars change.
4. Add: `haptic-confirm`, toast "Added to Lunch · Undo", sheet closes.

Rules: recent foods are one tap away; serving units follow the food (g, ml, piece); targets are shown, never judged.

### Recipes

- Recipe card: photo (if any, 4:3, `radius-lg`), name, kcal and P/C/F per serving.
- Detail: ingredients with a servings stepper that rescales amounts, steps in `body-lg`, "Log a serving" as the primary button.
- Cooking view keeps the screen awake and uses Active-size steps for messy hands.

### Body measurements and progress photos

- Log weight with one `NumberStepper` sheet, prefilled with the last value.
- Measurements (waist, chest, arms, hips, thighs) as a list of `StatTile`s; tap to log.
- Progress photos in a private grid; compare two dates side by side.
- Trends use the smoothed weight chart; changes are reported neutrally, never in red or green.

### Onboarding (account first)

The person signs in before being asked anything, then answers one question per screen until the required steps are done (`pendingOnboardingSteps`, derived from the profile; no stored flag).

1. Sign-in is the email screen (email field, one primary Send code button, social buttons below), then the code screen (six `OTPField` boxes on `surface-control`, `radius-md`, tabular figures). The sixth digit submits; paste fills all six; a wrong code clears the boxes and shows a `danger` message; Send a new code is a secondary button with a 60 s countdown.
2. Each question screen has, top to bottom: a segmented progress bar (one `radius-full` segment per required step, filled `foreground`, the rest `surface-control`), the question as `title-xl` ("What should we call you?"), one `body` line in `text-muted`, one field, and the screen's one primary Continue.
3. On a phone the field sits near the top and Continue sits above the keyboard (keyboard-avoiding, never behind it). On web the form is one centred column of `max-w-sm`.
4. No skip and no back link: a pending required step is the only way into the app. A new step is a new row in the registry and a new screen; existing accounts meet it on their next launch.

## Implementation

One token file is the source of truth; a build step writes the native adapter in HeroUI Native's variable names, and the email templates read the roles directly. A future web client would add an adapter in its own library's names.

### Repo shape

| Path                                      | Role                                                                                                                                                                                                                                                                         |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/ui/src/tokens/brand.ts`         | Every role from this doc with `light` and `dark` values, the shared Vermillion-only colors, the type scale, radius and fonts                                                                                                                                                 |
| `packages/ui/src/tokens/to-native-css.ts` | `nativeTokenSources`: HeroUI Native name -> role, depth shadows, Geist font tokens; writes `src/styles/native-tokens.css`                                                                                                                                                    |
| `apps/native/global.css`                  | Imports `native-tokens.css` after `heroui-native/styles`                                                                                                                                                                                                                     |
| `apps/native/src/platform/ui/`            | HeroUI `Button` and `Card` in Vermillion shape (import these, not HeroUI's), plus components copied in from PanelUI and Reacticx and restyled to tokens (ADR 0030): `Field`, `OtpInput`, `SearchBar`, `Skeleton`, `EmptyState`, `SegmentedControl`, `NumberFlow`, `StatTile` |

After editing `brand.ts`, regenerate and commit the CSS (a test fails if they drift):

```sh
pnpm --filter @workspace/ui tokens
```

Product code uses semantic utilities only; never a hex value or a `gray-*` class.

### Watch out: same names, different meanings

| Name           | HeroUI Native means  | shadcn/coss means                             | Vermillion mapping                                                                                         |
| -------------- | -------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `accent`       | Primary action color | Subtle hover background                       | HeroUI `--accent` = `action`; shadcn `--accent` = `surface-control`                                        |
| `muted`        | Secondary text color | Muted background (text is `muted-foreground`) | HeroUI `--muted` = `text-muted`; shadcn `--muted` = `surface-control`, `--muted-foreground` = `text-muted` |
| Primary action | `--accent`           | `--primary`                                   | Both = `action`                                                                                            |
| Card           | `--surface`          | `--card`                                      | Both = `surface`                                                                                           |

### Utilities by role

| Role                           | Web class                                | Native class                           |
| ------------------------------ | ---------------------------------------- | -------------------------------------- |
| `canvas`                       | `bg-background`                          | `bg-background`                        |
| `surface`                      | `bg-card`                                | `bg-surface`                           |
| `surface-control`              | `bg-muted`, `bg-secondary`, `bg-accent`  | `bg-default`, `bg-field`               |
| `surface-floating`             | `bg-popover`                             | `bg-overlay`                           |
| `hairline` / `hairline-strong` | `border-border` / `border-ring`          | `border-border` / `border-separator`   |
| `text-primary`                 | `text-foreground`                        | `text-foreground`                      |
| `text-secondary`               | `text-subtle`                            | `text-subtle`                          |
| `text-muted`                   | `text-muted-foreground`                  | `text-muted`                           |
| `action` / `on-action`         | `bg-primary` / `text-primary-foreground` | `bg-accent` / `text-accent-foreground` |
| the accent as text or an icon  | `text-primary`                           | `text-accent-text`                     |
| the accent as a fill or mark   | `bg-primary`                             | `bg-accent`                            |
| `chart` / `chart-1`…`5`        | `bg-chart`, `bg-chart-1`…                | `bg-chart`, `bg-chart-1`…              |
| `danger`                       | `text-destructive-foreground`            | `text-danger`                          |

Text styles: `text-title-xl`, `text-title-lg`, `text-title-md`, `text-body-lg`, `text-body`, `text-label`, `text-caption`, `text-overline` and `text-numeric-{hero,xl,lg,md,sm}`. On web the class carries the weight; on native the weight picks the Geist face, so every Text and TextInput carries a face: `font-normal` (body, caption), `font-medium` (label) or `font-semibold` (titles, numeric). Text without one falls back to the system font. Pair every numeric style with `numeric` (web) or `tabular-nums` (native).

Radius: web `--radius` is 12px, and `globals.css` sets `rounded-xs` 4, `rounded-sm`/`md` 8, `rounded-lg` 12, `rounded-xl`/`2xl` 16, `rounded-3xl` 28. Native `--radius` is 8px with HeroUI's multipliers (`rounded-xl` 12, `rounded-2xl` 16) and `--field-radius` 12.

Native font assets come from `@expo-google-fonts/geist` and `@expo-google-fonts/geist-mono`.

Icons: `phosphor-react-native` on native (`@phosphor-icons/react` would be the web counterpart).

### Email

`packages/email` renders transactional mail with React Email. Its theme (`src/theme/tokens.ts`) imports the role values from `brand.ts`, so a rebrand needs no edit there. Email clients know neither CSS variables nor our font, so the values are inlined as hex.

- Light first. Page background `canvas`; the content sits in one flat card: `surface` with a 1px `hairline`, `radius` 16, no shadow, no accent hue. Text is `text-primary` for titles, `text-secondary` for body and `text-muted` for hints and the footer.
- Type is Geist where installed, with the system UI font as fallback, on the `title-lg`, `body`, `label` and `caption` scale. The app name is the wordmark above the card and comes from `app.config.ts`.
- The sign-in and change-email code is one text node in `numeric-xl` tabular figures with wide letter spacing, centred in a `radius-md` box on `surface-control`. Code emails carry no links. The subject starts with the code ("123456 is your {app} code") so lock-screen previews show it.
- The one link email (account deletion) has a single primary button, `action` fill and `on-action` text, with the URL repeated below as plain text.
- Dark: a `prefers-color-scheme: dark` block (plus the Outlook.com `data-ogsc` selectors) swaps in the dark role values through `m-*` classes. Apple Mail honours it; clients that ignore it show the light email.
- Copy lives in the i18n package (`emails__*`), English only for now, with i18n retained for future languages.

## Do's and don'ts

| Do                                                      | Don't                                                              |
| ------------------------------------------------------- | ------------------------------------------------------------------ |
| Use one filled primary button per screen                | Put two primary buttons side by side, or add a brand hue to the UI |
| Reference role tokens (`bg-surface`, `text-muted`)      | Hardcode hex values or Tailwind `gray-*` in screens                |
| Show every macro graphic with its number                | Rely on ring color alone                                           |
| Keep macro order P, C, F everywhere                     | Reorder macros per screen                                          |
| Report over-target and weight changes neutrally         | Use red or `danger` for eating or weight results                   |
| Build depth from surface steps and spacing              | Add shadows to cards                                               |
| Use `tnum` on every number                              | Let timers and columns shift width                                 |
| Wrap the workout screen in `density="active"`           | Use Active sizes outside a live workout                            |
| Offer undo by toast for logging actions                 | Interrupt logging with confirm dialogs                             |
| Play celebrations once, skippable                       | Loop animations or block input                                     |
| Use Phosphor from the icon map                          | Mix icon sets or use two icons for one concept                     |
| Destructive actions as rose text + confirm              | Use filled red buttons                                             |
| Test every screen in both modes and at large text sizes | Ship a screen checked only in dark mode                            |

## Known gaps and next steps

The token layer is complete; what remains is verification on device and a few systems this doc does not cover yet.

### Verify on device

- [ ] Geist tabular figures keep set columns and timers stable on iOS and Android, and Geist Mono renders in Markdown
- [ ] Dark surface steps stay distinguishable at 30% brightness and outdoors
- [ ] Light-mode carbs bars read clearly next to protein and fat
- [ ] Spring values for sheets feel snappy on a mid-range Android phone
- [ ] HeroUI Native variable names match the installed package version
- [ ] shadcn/coss derived radius steps match the radius table

### Not yet designed

- Exercise demonstrations and muscle-group body maps (custom illustration project)
- Onboarding and goal-setting flow (targets, units, experience level)
- Wearable and Health app sync states
- Notifications and widgets (rest timer on lock screen, daily macro widget)
- Social features, if any (sharing PRs, coaches)
- Marketing site: reuse the tokens; this is where a hero stripe and big display type belong

### Suggested build order

1. Token package and both adapters
2. Buttons, inputs, cards, chips, sheets, toasts restyled in HeroUI Native
3. `NumberStepper`, `SetRow`, `RestTimer`, `LiveWorkoutBar` (the Active-mode core)
4. `MacroSummary`, `MealSlotCard`, `FoodRow` (macro colours were removed in the Nov 2026 redesign; these need a new treatment before they are built)
5. Charts, then the web dashboard on coss ui
