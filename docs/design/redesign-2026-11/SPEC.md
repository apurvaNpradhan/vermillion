# Sigil redesign — November 2026

Agreed with the owner on 2026-11-23 in a grilling session. Every decision below is settled; do not
re-open them. Where a detail is not specified, follow DESIGN.md, CONTEXT.md and AGENTS.md and pick
the simplest option consistent with this spec. When this spec contradicts DESIGN.md, this spec wins
and DESIGN.md must be updated to match.

Repo: `/home/apurva/Workspace/collaborations/vermillion` (pnpm + turbo monorepo; native app is
Expo + Uniwind/Tailwind v4 + HeroUI Native; web landing is `apps/web` on Cloudflare Workers).

Order: P1 must land before P2 and P3. P4 (landing) and Audio are independent.

---

## P1 — Foundations

### Theme system (replace, do not keep alongside)

- Remove the existing colour-scheme system: the Sigil beige/ember palette (`packages/ui/src/tokens/themes/sigil.ts`),
  theme variants (`sigil-light`, `sigil-dark-contrast`, …), the contrast setting, and any tokens
  that only existed for them. Saved theme ids that no longer exist migrate to the new default.
- Two modes, same structure:
  - **Dark = true AMOLED**: background `#000000`, cards/raised surfaces near-black (≈`#0A0A0A`, `#141414`),
    hairline borders, neutral (untinted) greys, white ink.
  - **Light = pure white**: background `#FFFFFF`, cards ≈`#F5F5F5`, neutral greys, near-black ink.
- Setting: **System / Light / Dark**, default **System**.
- **Accents** (Todoist-style picker in **Settings → Appearance**, next to the mode control), in this order:
  **Lime (default), Teal, Blueberry, Lavender, Mono**. Mono = white on dark / black on light.
  Each accent has a hand-tuned value for light and for dark (and an "on-accent" foreground) so
  contrast passes in both (Lime in light mode is a deeper olive-lime). No Tangerine, no Vermillion.
- **Accent is used only for**: primary buttons, the current/active set, completed set rows,
  records/PRs, selected tab and chips, primary chart series. Never large surfaces.
- **Semantic colours**: keep **red (danger)** for destructive actions and errors only.
  **No success colour** (positive states are the accent). **No amber/warning colour**: warnings
  (stall, lighter week) are neutral text + an icon. Remove `identity`/ember, `brand-detail`,
  `set-done`/lichen and similar legacy roles; map their usages to accent or neutral.
- Charts may keep a neutral/categorical palette for secondary series, but the primary series is the accent.
- Token pipeline stays (`packages/ui/src/tokens`, `pnpm --filter @workspace/ui tokens`); regenerate.

### Type

- **Geist + Geist Mono everywhere** (app already uses them). Tabular figures for weights, reps,
  durations and any numeric column.

### Session editor (`apps/native/src/session/sets/exercise-row.tsx`, `set-row.tsx`, `tick-mark.tsx`)

- Keep the accordion behaviour (`src/session/logging/accordion.ts`). **Remove the chevron (`CaretDown`) trigger.**
  - Tap the header → toggle expand/collapse (both directions).
  - Tap the thumbnail → open exercise detail. "View exercise" also in the ⋮ menu.
  - ⋮ menu shows on every header (collapsed too), not only expanded.
- **Completed set**: the whole row gets an accent tint (≈15% alpha, rounded, full row width),
  checkbox filled with accent, numbers stay full contrast. Short tint fade-in + light haptic on tick.

### Charts (`apps/native/src/platform/ui/charts/` — keep the PanelUI-derived component, no new library)

- Aggregate per session or per week (not every raw point); ≤3–4 y gridlines.
- One accent line + faint area fill; dashed best/PR reference line.
- Tap-and-drag scrub with tooltip.
- Bars for volume/distance; lines for e1RM/pace.
- **Human units** (`exercise-numbers.tsx`, `numbers.ts`, `en.json`): durations `40:00` / `1:05:00`,
  distance `7.0 km` (metres under 1 km: `850 m`), pace `5:43 /km`. Remove the bogus m/s pace.

---

## P2 — Screens

### Home (`src/training/home/*`)

- **Week strip** stays; swipe to change weeks. Remove the ‹ Today › buttons; tapping the month label jumps to today.
- **Hero: Next workout card** — program position ("Week 3 · Day 2"), exercise list with last time's
  top set each, last session's duration, big **Start**. Reuse/absorb `active-program-card.tsx`.
- **"This week" row** — sessions done / planned, sets, volume with change vs last week
  (moved from History's week period card).
- **Contextual cards only when relevant**: lighter-week suggestion, stalled exercise, records from the last session.
- **Weight card** only if weight was logged in the last 30 days.
- Past-day selection in the strip still shows that day's sessions.

### History (`src/session/history/*`)

- Top: the **same week strip as Home**; pull down to expand into a month calendar; tap a day to jump.
- One list of sessions grouped by week; each week heading carries a summary
  ("4 sessions · 62 sets · 14.2 t").
- Remove the Week/Month/Year/All segmented control and the shape-shifting PeriodCard.
- New **Reports** screen (header button next to Muscles and Log past) holds month/year summaries
  (reuse ReportCard / month calendar / year grid / all-time facts there).
- Keep long-press menu (Perform again / Open details).

### Muscles (`src/training/muscles/*`, reached only from the History header — not a tab)

- Each muscle row: **this week's sets vs weekly target** as a progress bar ("8 / 12 sets"),
  with a small marker for the 4-week average ("avg 10"). Tap a muscle → 8-week bar chart.
- **Cut the radar chart.** Merge the distribution card into the rows.
- Body map = this-week heatmap (accent intensity).
- Group icons (e.g. Push → chest, front delts, triceps highlighted) using the **existing interim WebP art**
  in `src/body-map/assets/interim/` (owner accepted the licence risk; leave its README warning).

### Exercise detail (`src/exercise/detail/*`)

Top to bottom: media header + small muscle map → pinned note → **3 stat tiles** (best set; e1RM or
best distance/pace; last time) → one row of metric chips + range chips (3M · 1Y · All) → improved chart
→ **records as a 2-column grid** with human units → recent sessions (top set only) with "See all" →
how-to/instructions collapsed at the bottom.

---

## P3 — Share links

- Shareable: **programs** and **workouts**. A finished session still shares the image card plus a link
  that imports it as a **workout template** (its sets/weights become targets), never as logged history.
- URLs: `https://sigil.lostsignal.cloud/p/<CODE>` (program), `/w/<CODE>` (workout), host from
  `app.config.ts` `urls.site`. Codes: 6 chars, unambiguous alphabet (no 0/O/1/I/L).
- Server (`packages/api`, Hono + oRPC) stores an **immutable snapshot** in a versioned JSON format
  (`sigil.program/v1`, `sigil.workout/v1`). Creating a link requires sign-in. Owner can **revoke**.
  No expiry. Public read endpoint returns the snapshot by code.
- Exercises map by catalog id; custom exercises fall back to name + equipment and are created as new
  custom exercises on import.
- **Android App Links** verified on the site domain (`/.well-known/assetlinks.json` on the web app,
  intent filters in `app.config.ts`) → link opens an **"Add to my programs/workouts" preview** in the app.
- Without the app: a small web preview page on `apps/web` (program/workout contents + Download button).
- Manual **"Enter code"** entry in the app.
- Share card (`src/share/card-canvas.tsx`) prints the link + code in its reserved slot.
- Design the format so a future starter-program library can reuse it.

---

## P4 — Landing page (`apps/web`) — improve the existing layout, not a new direction

- Wordmark: **Geist Bold**, tight tracking (≈−0.04em), left edge exactly aligned with the headline;
  remove the `-0.04em` margin nudge and any GSAP mask offset causing the rightward drift. Drop EB Garamond entirely.
- Replace the statue + golden-ratio overlay with **a real app screenshot** (live log with a completed,
  accent-tinted row) in a plain device frame. Remove "Nonfinito", "Unfinished, c. 1530", the seal ring
  and other classical motifs.
- Copy (all in `apps/web/src/content/en.ts`):
  - Overline: `STRENGTH LOG · ANDROID`
  - H1: **Hit your reps. The weight goes up.**
  - Lead: _Sigil runs your program. It lines up the next workout, sets a target for every exercise, and adds weight when you hit it. If you stall, it eases off._
  - One button: `Download for Android` (remove the Obtainium button from the hero).
  - Facts row: `Works offline` only.
  - Progression section (replaces manifesto): label `PROGRESSION`, H2 **You lift. Sigil does the math.**,
    body _Each exercise has a target. Hit it and next time asks for a little more: another 2.5 kg or one more rep. Miss it a few times running and Sigil flags the stall and suggests a lighter week. No spreadsheet. No guessing._
    — **verify "2.5 kg" and the stall wording against the progression code** and adjust numbers to match reality.
  - Features: H2 **Everything else stays out of the way.**, lead _Four things, done properly. No feed. No coach._
    - Programs: "Your next workout is always ready." / "Build a rotation once. Sigil queues each day in order and remembers where you left off."
    - Live log: "Last time's numbers, already filled in." / "Tick a set and the rest timer starts. Plate math and warm-ups are built in."
    - Records: "Records flagged the moment you set them." / "Every exercise gets a chart, so you can watch the numbers climb."
    - Offline: "Works in a basement." / "Everything saves on your phone first and syncs once you have signal. Bring your history from Strong or Hevy."
  - Install: H2 **On Android, through GitHub.**, lead "Not on iPhone yet.", steps unchanged.
  - Close: H2 **Your next session already knows the weight.** + `Download for Android`.
  - Page title: **Sigil — the strength log that progresses for you**
- `app.config.ts`: `tagline` → **Hit your reps. The weight goes up.** (replace "Earn the mark." everywhere).
- Site uses the new AMOLED black + Lime accent.

---

## Audio

- Replace the uisfx "zen" MP3s and `rest_end.wav` (`apps/native/assets/sounds/`, `src/session/settings/sound-cues.ts`)
  with a **custom soft-bell family** synthesised with open-source tools (owned outright, no licence),
  all in one musical key: tick, progress step, finish, record/achievement, error, rest end
  (rest end longer and more noticeable; also the notification sound in `app.config.ts`).
  Tick → progress step → finish should rise as a phrase.
- Produce **two variants (bell, marimba)** for the owner to audition; keep the generator script in the repo.
- Update `CREDITS.md`.

---

## Reference only

`docs/research/competitor-features.md` — competitor feature list. Not a roadmap change.

## Review

A Codex review runs once, after all phases are done — not per phase.
