# Design

The Vermillion design system. Tokens live in `packages/ui/src/tokens/brand.ts`; see Implementation for how they reach native and email.

> The public site (`apps/web`) uses a fixed monochrome palette. The **Web** and coss / shadcn examples below are references for a future companion app; they do not describe the public site.

## Native appearance

Native ships two themes, **Sigil** (the default) and **Classic**, each in light and dark at standard
or increased contrast. Match device is the default appearance. The brand spec is
[docs/design/sigil/SPEC.md](docs/design/sigil/SPEC.md); where this file disagrees with it, the spec wins.

- **Sigil** is two inks and one rare ember (`packages/ui/src/tokens/themes/sigil.ts`): ground
  `#0B0A09` / `#EFEBE2`, ink `#ECE6D8` / `#141210`, hairline, raised and control surface steps, no
  borders. The primary action, focus ring, toggles, progress rings and rest timers are **ink**.
  **Ember** (`identity`) means "you / now / earned" only: the current set, a personal record, today,
  the active tab's dot and a selected chip's text. Completed sets use lichen (`set-done`,
  `set-done-soft`). Danger is a cooler rose, never ember, always with an icon and words. Charts use
  lichen, sand and stones, never ember. The engine's `override` input pins the spec's exact values;
  `accent-soft-text` stays tied to the ink action so pressed pairs keep AA.
- **Classic** is a base, an ink accent and a family of data colours per scheme
  (`themes/classic.ts`). Its identity is near-neutral.
- Saved theme ids that no longer exist (`patina`, `oxide`, `slate`, `mulberry`, unknown) fall back to
  Sigil. `nativeColors` in `brand.ts` holds every variant (`sigil-dark`, `classic-light-contrast`, …);
  the built-in `light` and `dark` carry Sigil at standard contrast. Email uses those.
- `device.theme` stores `{ theme, appearance, contrast }`. Native chrome, status bars and blur
  use `useThemeMode()`.
- EB Garamond (500, 600) sets only the large titles of tab roots, onboarding step titles, the
  sign-in wordmark and the session finish title (`font-display`, `text-display-lg`,
  `text-display-wordmark`). Collapsed headers and everything else stay Geist.
- Brand images (icon, adaptive and notification icons, splash, graded sign-in photo) are generated
  by `pnpm brand:assets`. Sign-in is always dark. Empty states draw the hairline construction
  drawing (`ConstructionDrawing`) with a mono count label, one plain line and at most one action.

See the [native themes guide](docs/guides/native-themes.md).

## Overview

Vermillion is a precise, quiet tool for training and nutrition. It is built on tinted surface steps, spaced groups, tight corners, Geist with tabular figures, one accent that means "you / now" and one primary action per screen, plus what a phone-first fitness app needs: color as data, big numbers, touch sizes for sweaty hands, motion, and haptics.

Platforms: iOS and Android via React Native + Expo + HeroUI Native. A web companion is a later decision. One token source (`packages/ui/src/tokens/brand.ts`) feeds native and email.

### Principles

1. **Numbers are the headline.** Weight, reps, calories and macros get the biggest type on screen, set in tabular figures.
2. **Color is meaning, never decoration.** Tinted neutrals carry the interface; the accent marks what is yours or current and fills the primary action. Status, set kinds, macros and chart series come from the theme's family. Everything else is neutral.
3. **One loud thing per screen.** At most one filled primary button (the accent) in any view.
4. **Quiet surfaces, clear groups.** Depth comes from surface steps, rounded corners and spacing. Only floating layers add shadows.
5. **Designed for the gym, not the desk.** Active mode gives 56–64pt targets, giant numbers and haptic confirmation for the moments your hands are busy.
6. **Celebrate once, then get out of the way.** PRs and streaks get one expressive moment; nothing loops or blocks.
7. **Role tokens only.** Components reference roles (`surface`, `text-primary`), never hex values, so light and dark mode come from the same code.

### Foundations at a glance

| Area     | Rule                                                                                             |
| -------- | ------------------------------------------------------------------------------------------------ |
| Modes    | Light and dark (Match device), standard or increased contrast                                    |
| Action   | The accent fills the one primary button                                                          |
| Color    | Accent = you / now; `chart-1` is the accent, `chart-2`…`5` and status come from the theme family |
| Surfaces | Four steps, spaced for phone screens                                                             |
| Depth    | No shadows except floating layers and the button keycap edge                                     |
| Controls | 44pt Standard, 56–64pt Active                                                                    |
| Type     | Geist, Geist Mono for code, `tnum`, numeric display tier up to 72pt                              |
| Radius   | 4/8/12/16/28                                                                                     |
| Motion   | Full motion and haptic token sets                                                                |

## Decision log

Fourteen decisions; the first twelve settled in the grilling session on 8 Nov 2026, the rest the same day. Change one only by updating this table and every section it touches.

| #   | Decision          | Choice                                                                                                | Why                                                                              |
| --- | ----------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 1   | Primary platform  | Phone-first native, web later                                                                         | Sets and meals are logged in the moment, on a phone                              |
| 2   | Color modes       | Dark default + light mode, role-based tokens                                                          | Bright gyms and kitchens; light mode costs a week, not a month                   |
| 3   | Primary action    | Muted fill with light text in dark, deep fill with light text in light                                | A clear primary action with a subdued fill                                       |
| 4   | Macro colors      | Protein blue, carbs amber, fat orchid; calories neutral                                               | Color-blind safe, avoids red-orange, green reserved for goal hit                 |
| 5   | Number typeface   | Geist for numbers                                                                                     | `tnum` aligns digits across tables and timers                                    |
| 6   | Density           | Two densities: Standard + Active                                                                      | Mid-workout use needs bigger targets than planning screens                       |
| 7   | Radius            | 4 / 8 / 12 / 16 / 28 + full                                                                           | Precise corners, one step softer for phones                                      |
| 8   | Depth             | No shadows except floating layers                                                                     | Filled cards; sheets need separation in light mode                               |
| 9   | Motion            | Fast and functional, expressive only for celebrations                                                 | No bounce on repeated actions; PRs feel earned                                   |
| 10  | Icons             | Phosphor (Regular / Bold / Fill)                                                                      | Weights map onto Standard, Active and selected states                            |
| 11  | Charts            | Clean and minimal, color = meaning                                                                    | Smoothed weight trend, highlight PRs and today with weight and labels, not a hue |
| 12  | Stack             | Expo + HeroUI Native; web deferred                                                                    | One token source, a native adapter and the email templates (see Implementation)  |
| 13  | Navigation shell  | Floating icon-only tab pill that morphs into a menu panel, collapsing page header (ADR 0028, amended) | Linear-like and thumb-first; the tab count can grow to five without a redesign   |
| 14  | Native components | HeroUI Native base; missing parts copied in from PanelUI / Reacticx (ADR 0030)                        | No second icon set or peer-dependency tree; every copy restyled to tokens        |

## Color

Every color is a role with a dark and a light value; components never reference a hex. All text pairs below were checked against WCAG 2.1: 4.5:1 for text, 3:1 for icons and graphics.

The primary button uses a contrasting neutral. Saturated colors indicate data and status.

### Surfaces and lines

| Role               | Dark      | Light     | Use                                                   |
| ------------------ | --------- | --------- | ----------------------------------------------------- |
| `canvas`           | `#07080A` | `#F4F4F6` | Screen background                                     |
| `surface`          | `#111214` | `#FFFFFF` | Cards                                                 |
| `surface-control`  | `#1C1D20` | `#ECECEF` | Inputs, steppers, inactive chips, ring and bar tracks |
| `surface-floating` | `#18191C` | `#FFFFFF` | Sheets, toasts, floating timer bar                    |
| `hairline`         | `#26282B` | `#E2E2E6` | Input and selected-option outlines                    |
| `hairline-strong`  | `#393B3F` | `#C9C9CF` | Focused inputs and selected options                   |
| `backdrop`         | black 60% | black 30% | Dimming behind sheets and dialogs                     |

### Text

| Role             | Dark      | Light     | Contrast on `surface` (dark / light)           |
| ---------------- | --------- | --------- | ---------------------------------------------- |
| `text-primary`   | `#F4F4F6` | `#111214` | 17.1 / 18.6                                    |
| `text-secondary` | `#CDCDCF` | `#3C3D42` | 11.8 / 10.8                                    |
| `text-muted`     | `#9C9C9F` | `#65666C` | 6.9 / 5.7                                      |
| `text-disabled`  | `#6A6B6E` | `#A3A4AA` | Decorative only, never sole carrier of meaning |
| `text-on-accent` | (removed) | (removed) | Use `on-action`                                |

### Primary action

| Role             | Dark      | Light     | Use                                        |
| ---------------- | --------- | --------- | ------------------------------------------ |
| `action`         | `#E6E6E6` | `#111214` | Primary button fill, selected switch track |
| `on-action`      | `#2F3031` | `#FFFFFF` | Label on the primary button                |
| `action-hover`   | `#FFFFFF` | `#2A2B2F` | Hovered primary                            |
| `action-pressed` | `#CDCECE` | `#000000` | Pressed primary                            |

### Status

| Role      | Dark                         | Light                          | Rule                                                                                 |
| --------- | ---------------------------- | ------------------------------ | ------------------------------------------------------------------------------------ |
| `danger`  | `#FF5C7A`                    | `#D21F4B`                      | Rose; always icon + words                                                            |
| `success` | `#59D499`                    | text `#177A4B`, fill `#2FB872` | Goal hit, completed set, saved                                                       |
| `warning` | `#FFC533`                    | `#8F6200`                      | Shares the carbs hue, so always with a warning icon and never inside a macro display |
| `info`    | `text-secondary` + info icon | same                           | No color: blue belongs to protein                                                    |

### Macros (data colors)

| Macro    | Dark fill + text | Light fill (rings, bars) | Light text     | Soft tint   |
| -------- | ---------------- | ------------------------ | -------------- | ----------- |
| Protein  | `#57C1FF`        | `#1A86CC`                | `#0B6FA8`      | fill at 15% |
| Carbs    | `#FFC533`        | `#BF8500`                | `#8F6200`      | fill at 15% |
| Fat      | `#D98BC4`        | `#B0509B`                | `#94407F`      | fill at 15% |
| Calories | `text-primary`   | `text-primary`           | `text-primary` | none        |

Light-mode carbs fill reaches only 2.7:1 against its track, because amber can't get darker and stay amber. That is acceptable only because every ring and bar is paired with its number ("142 / 180 g"). Never show a macro graphic without its value.

### Color rules

- One filled primary (`action`) button per screen, at most. No other hue marks an action.
- Macro colors appear only next to that macro's data; order is always P, C, F.
- Going over a macro target is never shown in `danger`. Use a small marker and "+12 g" in `text-secondary`.
- `success` green marks a hit goal with a check; the macro keeps its own color.

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

| Token          | Size / line | Weight | Tracking | Use                                |
| -------------- | ----------- | ------ | -------- | ---------------------------------- |
| `numeric-hero` | 72 / 76     | 600    | -1.5     | Rest timer, calories remaining     |
| `numeric-xl`   | 48 / 52     | 600    | -1.0     | Current set weight × reps          |
| `numeric-lg`   | 32 / 36     | 600    | -0.5     | Daily totals, body weight          |
| `numeric-md`   | 20 / 24     | 500    | -0.2     | Macro values in cards, set history |
| `numeric-sm`   | 15 / 20     | 500    | 0        | Table cells, chart axis labels     |

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
- **Tab bar:** a floating, icon-only pill, a fixed 56pt tall, 8pt above the bottom safe area, on level 3 depth with no outline (floating surfaces rely on the layer step and shadow). It holds the direct tabs (the tab bar's `directTabCount`; Vermillion sets one, Home) and a menu slot that shows `CaretUpDown`, or, while a menu screen is open, that screen's icon. The active tab is a capsule: `identity-soft` fill with an `identity` Fill icon. Tap the menu slot, or press and slide up to pick a row (a `haptic-tick` per row): the pill morphs into a panel with the same left edge, widening up to the compose button. The panel lists every tab route (up to five in all: today Home, Exercises, Settings; later Today, Train, Eat, Progress, You) under the account header. No dim backdrop. Content fades into the canvas under the bar. The bar hides while the keyboard is up.
- **Tab action:** the open tab's one main action (New exercise) is a 56pt round `identity` button with an `on-identity` icon to the right of the pill, inside thumb reach; tabs without one show nothing there.
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

| Token            | Expo call                                 | Use                                             |
| ---------------- | ----------------------------------------- | ----------------------------------------------- |
| `haptic-tick`    | `selectionAsync()`                        | +/- weight and reps, picker scroll, chip select |
| `haptic-confirm` | `impactAsync(Medium)`                     | Set logged, meal logged, item saved             |
| `haptic-success` | `notificationAsync(Success)`              | Workout finished, macro goal hit, PR            |
| `haptic-alert`   | `notificationAsync(Warning)`, repeated 3× | Rest timer finished                             |

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
- Macro icons may take their macro color, only next to that macro's value.

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

Charts are minimal and color carries meaning: the `chart` role for ordinary series and macro colors for macros; PRs and today stand out by brightness, not hue.

| Chart                | Spec                                                                                                                                         |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Calorie ring         | Track `surface-control`, fill `text-primary`, 14pt stroke, round caps, starts at 12 o'clock; centre shows calories remaining in `numeric-lg` |
| Macro rings or bars  | Track `surface-control`, fill macro color, 8pt stroke (rings) or 6pt (bars); value + target always shown beside it                           |
| Over target          | Ring stays full; a 2pt tick marks the overflow, label "+12 g" in `text-secondary`; never `danger`                                            |
| Goal hit             | Small `success` check beside the value; ring keeps its macro color                                                                           |
| Trend line           | 2pt `text-primary` line, area fill `text-primary` at 6%; latest point a 6pt dot                                                              |
| Body weight          | Daily weigh-ins as 4pt dots in `text-muted`; 7-day moving average as the 2pt line                                                            |
| PR markers           | 8pt `text-primary` dot with `Trophy` on tap                                                                                                  |
| Weekly bars          | Past days `surface-control`, today `text-primary`, goal as dashed 1pt `hairline-strong` line; `radius-xs` on bar tops                        |
| Grid and axes        | Horizontal gridlines only, 1px `hairline`; no chart border; labels `numeric-sm` in `text-muted`                                              |
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
| Checkbox          | `Checkbox`            | `Checkbox`               | Set complete check = `success`                                                    |

### Custom fitness components

| Component          | Anatomy                                                                              | Key rules                                                                                                                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SetRow`           | Set number · previous (muted) · weight · reps · RPE (optional) · check               | Live row: `surface-control` bg + 3pt `text-primary` leading edge; done row: `text-muted` with `success` check; swipe left to delete with undo                                                     |
| `NumberStepper`    | − button · value (`numeric-md`/`numeric-xl`) + unit · + button                       | Tap value to type; long-press +/− repeats; `haptic-tick` per step; increments from user settings (2.5 kg / 5 lb)                                                                                  |
| `RestTimer`        | Ring · `numeric-hero` countdown · −15s / +15s / Skip                                 | Lives in the live workout bar when collapsed; `haptic-alert` at zero                                                                                                                              |
| `LiveWorkoutBar`   | Exercise name · elapsed · rest countdown                                             | Floating above tab bar on every screen while a session runs; tap to return                                                                                                                        |
| `MacroSummary`     | Calorie ring + three macro bars (P, C, F) with value / target                        | Fixed order P, C, F; values always visible                                                                                                                                                        |
| `MealSlotCard`     | Slot name · kcal total · food rows · Add                                             | Breakfast, Lunch, Dinner, Snacks; empty state is a single Add row                                                                                                                                 |
| `FoodRow`          | Name · serving · kcal · P/C/F mini values                                            | Tap to edit serving; macro letters in macro text colors                                                                                                                                           |
| `ExerciseCard`     | Name · muscle tag · set rows · Add set                                               | Collapses to one summary line when done                                                                                                                                                           |
| `PRBadge`          | `Trophy` + "PR" in `text-primary` on `surface-control`                               | Triggers `motion-celebrate` once when first earned                                                                                                                                                |
| `OtpInput`         | One cell per digit (56pt tall, `radius-lg`, `surface-control`) over one hidden input | Digits in `numeric-md`; focus = `hairline-strong` border, error = `danger` border plus a message; autofill and paste fill every cell, the last digit submits                                      |
| `SearchBar`        | 44pt `surface-control` field · magnifier · clear button                              | Shown only when there is something to search; filters the local list as you type; no results is an `EmptyState`, not a blank list                                                                 |
| `SegmentedControl` | `surface-control` track · `surface` pill on the selected option                      | Two to four options in one view (theme); pill slides in `motion-fast`; `haptic-tick` on change; use `Chip`s for filters, `ListRow` pickers beyond four options                                    |
| `Skeleton`         | `surface-control` blocks shaped like the content, pulsing opacity                    | First load only (the list's rows, 48pt); still under Reduce Motion; never for a spinner-length wait or for errors                                                                                 |
| `NumberFlow`       | Tabular digits that roll to a new value                                              | `motion-slow`; Reduce Motion swaps digits; the value sets the text style (`numeric-*`), the unit is separate                                                                                      |
| `StatTile`         | `overline` label · `numeric-lg` value + unit · change vs last period                 | Change shown neutral: "−0.8 kg" in `text-secondary`, no red/green judgement                                                                                                                       |
| `EmptyState`       | Phosphor icon (48pt, `text-muted`) · one line · one primary action                   | Never more than one sentence                                                                                                                                                                      |
| `SwipeRow`         | Row content · actions revealed on a left swipe                                       | Outermost action fires on a full swipe, with a `haptic-tick` at the threshold; destructive actions are rose on a 15% rose tint; the same actions are screen-reader actions and a long-press sheet |
| `ListSection`      | `overline` label · `surface` card of padded rows without dividers                    | Settings and pickers; rows show their current value in `text-muted` and a chevron, check or nothing on the right                                                                                  |

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

| Role                           | Web class                                     | Native class                           |
| ------------------------------ | --------------------------------------------- | -------------------------------------- |
| `canvas`                       | `bg-background`                               | `bg-background`                        |
| `surface`                      | `bg-card`                                     | `bg-surface`                           |
| `surface-control`              | `bg-muted`, `bg-secondary`, `bg-accent`       | `bg-default`, `bg-field`               |
| `surface-floating`             | `bg-popover`                                  | `bg-overlay`                           |
| `hairline` / `hairline-strong` | `border-border` / `border-ring`               | `border-border` / `border-separator`   |
| `text-primary`                 | `text-foreground`                             | `text-foreground`                      |
| `text-secondary`               | `text-subtle`                                 | `text-subtle`                          |
| `text-muted`                   | `text-muted-foreground`                       | `text-muted`                           |
| `action` / `on-action`         | `bg-primary` / `text-primary-foreground`      | `bg-accent` / `text-accent-foreground` |
| `protein*`, `carbs*`, `fat*`   | same name (`bg-protein`, `text-protein-text`) | same name                              |
| `danger`                       | `text-destructive-foreground`                 | `text-danger`                          |
| `success` / `success-text`     | `bg-success` / `text-success-foreground`      | `bg-success`                           |

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
4. `MacroSummary`, `MealSlotCard`, `FoodRow`
5. Charts, then the web dashboard on coss ui
