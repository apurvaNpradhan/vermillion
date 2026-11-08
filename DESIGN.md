# Design

The Vermillion design system. Tokens live in `packages/ui/src/tokens/brand.ts`; see Implementation for how they reach web and native.

## Overview

Vermillion is a precise, quiet, dark-first tool for training and nutrition, with no brand accent in the interface. It is built on near-black surface steps, hairline borders, tight corners, Inter with OpenType features and one white primary action per screen, plus what a phone-first fitness app needs: color as data, big numbers, touch sizes for sweaty hands, motion, and haptics.

Platforms: iOS and Android via React Native + Expo + HeroUI Native first; web with coss ui + shadcn/ui. One token source (`packages/ui/src/tokens/brand.ts`) feeds both.

### Principles

1. **Numbers are the headline.** Weight, reps, calories and macros get the biggest type on screen, set in tabular figures.
2. **Color is meaning, never decoration.** Neutrals carry the interface; the primary action is the brightest neutral. Blue, amber, orchid = protein, carbs, fat. Green = goal hit. Rose = error. Everything else is neutral.
3. **One loud thing per screen.** At most one filled primary button (white in dark mode) in any view.
4. **Quiet surfaces, crisp edges.** Depth comes from surface steps and 1px hairlines, not shadows. Floating layers and buttons (a raised keycap edge) are the only exceptions.
5. **Designed for the gym, not the desk.** Active mode gives 56–64pt targets, giant numbers and haptic confirmation for the moments your hands are busy.
6. **Celebrate once, then get out of the way.** PRs and streaks get one expressive moment; nothing loops or blocks.
7. **Role tokens only.** Components reference roles (`surface`, `text-primary`), never hex values, so light and dark mode come from the same code.

### Foundations at a glance

| Area     | Rule                                                         |
| -------- | ------------------------------------------------------------ |
| Modes    | Dark default + light mode via role tokens                    |
| Action   | White primary button in dark, near-black in light            |
| Color    | No accent hue; color only for data (macros) and status       |
| Surfaces | Four steps, spaced for phone screens                         |
| Depth    | No shadows except floating layers and the button keycap edge |
| Controls | 44pt Standard, 56–64pt Active                                |
| Type     | Inter + `tnum` + `ss01`; numeric display tier up to 72pt     |
| Radius   | 4/8/12/16/28                                                 |
| Motion   | Full motion and haptic token sets                            |

## Decision log

Thirteen decisions; the first twelve settled in the grilling session on 8 Nov 2026, the thirteenth the same day. Change one only by updating this table and every section it touches.

| #   | Decision         | Choice                                                                    | Why                                                                              |
| --- | ---------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 1   | Primary platform | Phone-first native, web later                                             | Sets and meals are logged in the moment, on a phone                              |
| 2   | Color modes      | Dark default + light mode, role-based tokens                              | Bright gyms and kitchens; light mode costs a week, not a month                   |
| 3   | Primary action   | White fill in dark, near-black in light, no hue                           | One loud action without a brand color competing with data colors                 |
| 4   | Macro colors     | Protein blue, carbs amber, fat orchid; calories neutral                   | Color-blind safe, avoids red-orange, green reserved for goal hit                 |
| 5   | Number typeface  | Inter for everything + numeric tier                                       | One font, smaller app, precise feel; `tnum` aligns numbers                       |
| 6   | Density          | Two densities: Standard + Active                                          | Mid-workout use needs bigger targets than planning screens                       |
| 7   | Radius           | 4 / 8 / 12 / 16 / 28 + full                                               | Precise corners, one step softer for phones                                      |
| 8   | Depth            | No shadows except floating layers                                         | Flat cards with hairlines; sheets need separation in light mode                  |
| 9   | Motion           | Fast and functional, expressive only for celebrations                     | No bounce on repeated actions; PRs feel earned                                   |
| 10  | Icons            | Phosphor (Regular / Bold / Fill)                                          | Weights map onto Standard, Active and selected states                            |
| 11  | Charts           | Clean and minimal, color = meaning                                        | Smoothed weight trend, highlight PRs and today with weight and labels, not a hue |
| 12  | Stack            | Expo + HeroUI Native; web on coss ui + shadcn/ui                          | One token source, two adapters (see Implementation)                              |
| 13  | Navigation shell | Floating icon-only tab pill + switcher, collapsing page header (ADR 0028) | Linear-like and thumb-first; the tab count can grow to five without a redesign   |

## Color

Every color is a role with a dark and a light value; components never reference a hex. All text pairs below were checked against WCAG 2.1: 4.5:1 for text, 3:1 for icons and graphics.

The interface has no accent hue: the primary button is the brightest neutral (`#FFFFFF` on dark, `#111214` on light), so the only saturated colors on screen are data (macros) and status.

### Surfaces and lines

| Role               | Dark      | Light     | Use                                                      |
| ------------------ | --------- | --------- | -------------------------------------------------------- |
| `canvas`           | `#07080A` | `#F4F4F6` | Screen background                                        |
| `surface`          | `#111214` | `#FFFFFF` | Cards                                                    |
| `surface-control`  | `#1C1D20` | `#ECECEF` | Inputs, steppers, inactive chips, ring and bar tracks    |
| `surface-floating` | `#18191C` | `#FFFFFF` | Sheets, toasts, floating timer bar                       |
| `hairline`         | `#26282B` | `#E2E2E6` | 1px card and input borders                               |
| `hairline-strong`  | `#393B3F` | `#C9C9CF` | Focused inputs, table dividers, floating top edge (dark) |
| `backdrop`         | black 60% | black 30% | Dimming behind sheets and dialogs                        |

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

Inter is the only typeface, with tabular figures on every number. Large numbers use Inter Display, Inter's tighter cut for big sizes.

### Font setup

- **Native:** load Inter 400 / 500 / 600 / 700 and Inter Display 600 as static files, and map them to HeroUI Native's `--font-normal`, `--font-medium`, `--font-semibold` and `--font-bold`.
- **Web:** load Inter (variable, with the optical-size axis) and set `font-feature-settings: "kern", "calt"` on body; the numeric classes below add `tnum` and `ss01`.
- **OpenType features:** `tnum` (equal-width digits) is the must-have and works on iOS, Android and web (`fontVariant: ['tabular-nums']` in React Native). `ss01` (open digits) is a nice-to-have; check that it renders on both phone platforms before relying on it.
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

Always `tnum`; `ss01` where supported.

| Token          | Size / line | Weight             | Tracking | Use                                |
| -------------- | ----------- | ------------------ | -------- | ---------------------------------- |
| `numeric-hero` | 72 / 76     | 600, Inter Display | -1.5     | Rest timer, calories remaining     |
| `numeric-xl`   | 48 / 52     | 600, Inter Display | -1.0     | Current set weight × reps          |
| `numeric-lg`   | 32 / 36     | 600                | -0.5     | Daily totals, body weight          |
| `numeric-md`   | 20 / 24     | 500                | -0.2     | Macro values in cards, set history |
| `numeric-sm`   | 15 / 20     | 500                | 0        | Table cells, chart axis labels     |

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
- **Tab bar:** a floating, icon-only pill, 56pt tall, 8pt above the bottom safe area, on level 3 depth. The first two tabs sit on the pill; a switcher (the current menu tab's icon plus `CaretUpDown`) opens a menu with the rest, up to five tabs in all: today Home and Notes, with Settings in the menu; later Today, Train, Eat, Progress, You. Tap the switcher, or press and slide up to pick a row (a `haptic-tick` per row). The selected tab gets the Fill icon on a `text-primary` 10% fill. Content fades into the canvas under the bar. The bar hides while the keyboard is up.
- **Tab action:** the open tab's one main action (New note) is a 56pt round `action` button to the right of the pill, inside thumb reach; tabs without one show nothing there.
- **Page header:** a `title-xl` title, left-aligned at the top of the content, scrolls away; a compact bar with the title centred (`body`, 600) fades in on `canvas` with a hairline (blurred on iOS). Tap it to scroll to the top. Pushed pages add a round back button; page actions sit in a floating capsule on the right.
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

Cards are flat: a surface step plus a 1px hairline. Only floating layers get extra separation, and only light mode uses a shadow.

| Level      | Dark                                                             | Light                                                                                                                     | Use                                              |
| ---------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| 0 Canvas   | `canvas`                                                         | `canvas`                                                                                                                  | Screen background, section headers               |
| 1 Card     | `surface` + 1px `hairline`                                       | `surface` + 1px `hairline`                                                                                                | All cards                                        |
| 2 Control  | `surface-control`, no border (border on focus)                   | same                                                                                                                      | Inputs, steppers, tracks inside cards            |
| 3 Floating | `surface-floating` + 1px `hairline-strong` top edge + `backdrop` | `surface-floating` + shadow `0 -4 24 rgba(0,0,0,0.10)` (sheets) or `0 8 24 rgba(0,0,0,0.12)` (toasts, menus) + `backdrop` | Sheets, dialogs, toasts, menus, live workout bar |

**Selection and lift** use the surface step, not shadow: a selected chip or row moves from `surface` to `surface-control`; the live set row moves to `surface-control` and adds a 3pt `text-primary` leading edge.

**HeroUI Native override:** its default theme puts `shadow-surface` on cards in light mode. Set that shadow to none and give `Card`/`Surface` a `border border-border` (mapped to `hairline`). Keep its `shadow-overlay` for floating layers, which already matches level 3. Its dark mode already drops card shadows and gives overlays an inset edge, so dark needs no change.

**Web:** same rule; remove `shadow-sm`/`shadow-xs` from coss/shadcn `Card` and keep shadows only on `Popover`, `Dialog`, `Sheet`, `Menu` and `Toast`.

## Motion and haptics

Motion is fast and functional; only celebrations are expressive, and they play once.

### Motion tokens

| Token              | Value                                                                   | Use                                                               |
| ------------------ | ----------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `motion-fast`      | 120ms, ease-out                                                         | Presses, toggles, chip selection, checkmarks                      |
| `motion-base`      | 200ms, ease-out                                                         | Elements appearing, rows expanding, tab content                   |
| `motion-slow`      | 320ms, ease-in-out                                                      | Rings filling, chart transitions, number count-ups                |
| `motion-sheet`     | Spring: damping 34, stiffness 420, mass 0.8, no overshoot (about 200ms) | Sheets, dialogs                                                   |
| `motion-celebrate` | \~800ms, one time                                                       | PR, streak, workout finished: a white diagonal stripe sweeps once |

On React Native these run through Reanimated, which HeroUI Native already uses; customize component motion with its `animation` prop rather than overriding styles. Spring values above are starting points to tune on device.

### Haptic tokens (`expo-haptics`)

| Token            | Expo call                                 | Use                                             |
| ---------------- | ----------------------------------------- | ----------------------------------------------- |
| `haptic-tick`    | `selectionAsync()`                        | +/- weight and reps, picker scroll, chip select |
| `haptic-confirm` | `impactAsync(Medium)`                     | Set logged, meal logged, item saved             |
| `haptic-success` | `notificationAsync(Success)`              | Workout finished, macro goal hit, PR            |
| `haptic-alert`   | `notificationAsync(Warning)`, repeated 3× | Rest timer finished                             |

### Motion rules

- Nothing bounces during repeated actions.
- Celebrations never loop, never block input, and can be skipped with a tap.
- With the system's Reduce Motion setting on, every animation becomes a 120ms fade; haptics stay.
- Numbers that change count up over `motion-slow` only on summary screens, never while logging.
- The rest timer's final 3 seconds pulse the timer text once per second, not the whole screen.

## Iconography

Phosphor Icons everywhere: `phosphor-react-native` on native, `@phosphor-icons/react` on web. coss ui and shadcn ship with Lucide by default; swap those imports so web and native share one icon language.

| Context                      | Weight  | Size            |
| ---------------------------- | ------- | --------------- |
| Standard UI                  | Regular | 20pt            |
| Active mode                  | Bold    | 24–28pt         |
| Selected tab, selected state | Fill    | same as context |
| Inline with `caption` text   | Regular | 16pt            |

### Icon color

- Default `text-secondary`; inactive tabs `text-muted`; selected tab `text-primary` + Fill weight.
- No accent hue on icons; the primary button's icon takes `on-action`.
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
| Notes tab, note     | `NotePencil`  |
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

Charts are minimal and color carries meaning: neutral data and macro colors for macros; PRs and today stand out by brightness, not hue.

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

| Need              | Native (HeroUI)   | Web (coss)               | Vermillion notes                                                                  |
| ----------------- | ----------------- | ------------------------ | --------------------------------------------------------------------------------- |
| Card              | `Card`, `Surface` | `Card`                   | `surface` + hairline, `radius-lg`, no shadow                                      |
| Text input        | `TextField`       | `Input`, `Field`         | `surface-control`, `radius-md`, focus = `hairline-strong` border, no colored ring |
| Chips and filters | `Chip`            | `Toggle Group`, `Badge`  | `radius-full`; selected = `surface-control` + `text-primary`                      |
| Segmented tabs    | `Tabs`            | `Tabs`                   | Time ranges, meal slots                                                           |
| Sheet             | `BottomSheet`     | `Sheet`, `Drawer`        | `radius-xl` top corners, level 3 depth                                            |
| Dialog            | `Dialog`          | `Dialog`, `Alert Dialog` | Destructive confirms only                                                         |
| Toast             | `Toast`           | `Toast`                  | `surface-floating`; "Set logged · Undo"                                           |
| Toggle            | `Switch`          | `Switch`                 | On = `text-primary` track                                                         |
| Checkbox          | `Checkbox`        | `Checkbox`               | Set complete check = `success`                                                    |

### Custom fitness components

| Component        | Anatomy                                                                | Key rules                                                                                                                                                                                         |
| ---------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SetRow`         | Set number · previous (muted) · weight · reps · RPE (optional) · check | Live row: `surface-control` bg + 3pt `text-primary` leading edge; done row: `text-muted` with `success` check; swipe left to delete with undo                                                     |
| `NumberStepper`  | − button · value (`numeric-md`/`numeric-xl`) + unit · + button         | Tap value to type; long-press +/− repeats; `haptic-tick` per step; increments from user settings (2.5 kg / 5 lb)                                                                                  |
| `RestTimer`      | Ring · `numeric-hero` countdown · −15s / +15s / Skip                   | Lives in the live workout bar when collapsed; `haptic-alert` at zero                                                                                                                              |
| `LiveWorkoutBar` | Exercise name · elapsed · rest countdown                               | Floating above tab bar on every screen while a session runs; tap to return                                                                                                                        |
| `MacroSummary`   | Calorie ring + three macro bars (P, C, F) with value / target          | Fixed order P, C, F; values always visible                                                                                                                                                        |
| `MealSlotCard`   | Slot name · kcal total · food rows · Add                               | Breakfast, Lunch, Dinner, Snacks; empty state is a single Add row                                                                                                                                 |
| `FoodRow`        | Name · serving · kcal · P/C/F mini values                              | Tap to edit serving; macro letters in macro text colors                                                                                                                                           |
| `ExerciseCard`   | Name · muscle tag · set rows · Add set                                 | Collapses to one summary line when done                                                                                                                                                           |
| `PRBadge`        | `Trophy` + "PR" in `text-primary` on `surface-control`                 | Triggers `motion-celebrate` once when first earned                                                                                                                                                |
| `StatTile`       | `overline` label · `numeric-lg` value + unit · change vs last period   | Change shown neutral: "−0.8 kg" in `text-secondary`, no red/green judgement                                                                                                                       |
| `EmptyState`     | Phosphor icon (48pt, `text-muted`) · one line · one primary action     | Never more than one sentence                                                                                                                                                                      |
| `SwipeRow`       | Row content · actions revealed on a left swipe                         | Outermost action fires on a full swipe, with a `haptic-tick` at the threshold; destructive actions are rose on a 15% rose tint; the same actions are screen-reader actions and a long-press sheet |
| `ListSection`    | `overline` label · `surface` card of rows with inset hairlines         | Settings and pickers; rows show their current value in `text-muted` and a chevron, check or nothing on the right                                                                                  |

### Accessibility (all components)

- Every icon-only button has an accessibility label ("Increase weight by 2.5 kilograms").
- `SetRow` announces as "Set 2, 80 kilograms, 8 reps, completed".
- Timers announce at 10 seconds and at zero, not every second.
- Selected and completed states are conveyed by icon and label, never color alone.

## Patterns

Four core flows, each built only from the components above.

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

## Implementation

One token file is the source of truth; a build step writes two adapters, one in HeroUI Native's variable names and one in coss / shadcn names. Both libraries theme with Tailwind v4 CSS variables, so the mapping is mostly renaming.

### Repo shape

| Path                                            | Role                                                                                                                         |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `packages/ui/src/tokens/brand.ts`               | Every role from this doc with `light` and `dark` values, the shared Vermillion-only colors, the type scale, radius and fonts |
| `packages/ui/src/tokens/to-web-css.ts`          | `webTokenSources`: coss / shadcn name -> role; writes `src/styles/tokens.css`                                                |
| `packages/ui/src/tokens/to-native-css.ts`       | `nativeTokenSources`: HeroUI Native name -> role, depth shadows, Inter font tokens; writes `src/styles/native-tokens.css`    |
| `packages/ui/src/styles/globals.css`            | Web radius steps, `numeric` utility, Inter features on `body`                                                                |
| `packages/ui/src/components`                    | coss ui components, restyled to this doc (flat cards, text-only destructive, field fills, neutral selection)                 |
| `apps/native/global.css`                        | Imports `native-tokens.css` after `heroui-native/styles`                                                                     |
| `apps/native/src/platform/ui/{button,card}.tsx` | HeroUI `Button` and `Card` in Vermillion shape; screens import these, not HeroUI's                                           |

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

Text styles: `text-title-xl`, `text-title-lg`, `text-title-md`, `text-body-lg`, `text-body`, `text-label`, `text-caption`, `text-overline` and `text-numeric-{hero,xl,lg,md,sm}`. On web the class carries the weight; on native the weight picks the Inter file, so add `font-semibold` (titles, numeric) or `font-medium` (label). Pair every numeric style with `numeric` (web) or `tabular-nums` (native).

Radius: web `--radius` is 12px, and `globals.css` sets `rounded-xs` 4, `rounded-sm`/`md` 8, `rounded-lg` 12, `rounded-xl`/`2xl` 16, `rounded-3xl` 28. Native `--radius` is 8px with HeroUI's multipliers (`rounded-xl` 12, `rounded-2xl` 16) and `--field-radius` 12.

Fonts: web loads `@fontsource-variable/inter/opsz.css` (variable, with the optical-size axis); native loads Inter 400/500/600/700 from `@expo-google-fonts/inter` before hiding the splash screen. Inter Display on native is still open (see Verify on device).

Icons: `@phosphor-icons/react` on web (also in `packages/ui`, set as the shadcn `iconLibrary`), `phosphor-react-native` on native.

## Do's and don'ts

| Do                                                      | Don't                                                              |
| ------------------------------------------------------- | ------------------------------------------------------------------ |
| Use one filled primary button per screen                | Put two primary buttons side by side, or add a brand hue to the UI |
| Reference role tokens (`bg-surface`, `text-muted`)      | Hardcode hex values or Tailwind `gray-*` in screens                |
| Show every macro graphic with its number                | Rely on ring color alone                                           |
| Keep macro order P, C, F everywhere                     | Reorder macros per screen                                          |
| Report over-target and weight changes neutrally         | Use red or `danger` for eating or weight results                   |
| Build depth from surface steps and hairlines            | Add shadows to cards                                               |
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

- [ ] `ss01` and Inter Display render on iOS and Android through Expo
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
