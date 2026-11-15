# 0041. Body metrics: weight trend, measurements and progress photos

Status: accepted (2026-11-15). Builds on [0040](0040-user-media.md). Specs: [docs/specs/body/](../specs/body/). Terms: Scale weight, Trend weight, Body measurement, Tracked metric, Check-in, Progress photo in [CONTEXT.md](../../CONTEXT.md).

## Context

Training is logged; the body is not. Bodyweight exists only as one preference (`ui.bodyweightKg`) used for bodyweight-exercise volume, so past Sessions are recomputed with today's weight. MacroFactor was studied from eight screenshots: a weight trend that ignores daily water swings and survives missing days, a "Weight changes" table, a 30-day weigh-in grid, measurement tiles with sparklines, and a metric setup screen. Its weak points are worth avoiding:

- The weight header leads with the range _average_, which says little.
- Measurement tiles colour change as good or bad, though a bigger waist and bigger arms mean opposite things.
- Untracked metrics still show as "--- in".
- A Daily/Weekly/Monthly averaging control the chart could decide on its own.

## Decision

### What is tracked

- **Scale weight**, logged any time, as often as wanted. Daily is encouraged by the reminder, never required.
- **Tape measurements** at these sites: neck, shoulders, chest, waist, hips, left/right bicep, left/right forearm, left/right thigh, left/right calf. The user picks which ones they track (**Tracked metrics**). Default: waist, chest, both biceps, both thighs.
- **Ratios**, computed, never stored: waist-to-height and waist-to-hip.
- **Progress photos**, by pose: front, side, back.
- Not now: body fat %, water (with nutrition later), steps and sleep (with Health Connect).

### Data

- Synced `body_measurement`: `id`, `user_id`, `metric`, `value` (kg or cm), `measured_at`, `local_date` (the user's calendar date when measured), `source` (`manual | health`), `created_at`, `deleted_at`. One tall table for every metric, ready for Health Connect.
- Synced `progress_photo`: `id`, `user_id`, `media_id`, `pose`, `local_date`, `taken_at`, `created_at`, `deleted_at`.
- A **Check-in** is everything sharing a `local_date`. There is no check-in row.
- `ui` preferences gain `lengthUnit` (`cm | in`, default from the weight unit), `heightCm`, `trackedMetrics`, `weightGoalKg`, `hidePhotos` (default true), and the two reminders.

### Trend weight

Pure functions, computed on read:

1. Entries on the same `local_date` are averaged.
2. Days between two logged days are linearly interpolated for the trend only; interpolated days never draw as points.
3. The trend is an exponential moving average with α = 0.1, seeded with the first day.

Derived: trend now, change over a range, rate per week (least-squares slope of the trend over the last 14 days, else the range), and the Weight changes table at 3, 7, 14, 30 and 90 days. A trend change under ±0.1 kg reads "Stable".

### Screens

- **Home** gains cards: Weight (right after Next up), then Measurements, Photos and Weigh-in habit after the muscles card. Each opens a page under `body/`. No new tab.
- **Weight card**: trend now, a 30-day sparkline, and "Log weight". Logging is two taps: the sheet opens already filled with the latest trend value on the keypad (±0.1 kg / 0.2 lb), Save.
- **Weight page**:
  - Header: trend now (large), change over the range and rate per week, then the date range.
  - Chart: scale weight as a faint thin line, trend as a bold line with small dots, the goal as a dashed line if set. Scrubbing, ranges 1W/1M/3M/6M/1Y/All. 1Y and All switch to weekly points on their own.
  - Below: Weight changes, the 30-day weigh-in grid, and entries grouped by month (tap to edit, swipe to delete). An info button explains scale weight against trend.
- **Measurements page**: a first tile with the latest progress photo and its date, then two-column tiles by group (Upper body, Arms, Legs, Ratios). Each tile shows its last-7 sparkline, latest value and change since the previous entry, in **neutral colours**. Untracked metrics are hidden. Tapping a tile opens that metric's chart: points joined by lines, not smoothed.
- **Check-in sheet**: pose slots, then one row per tracked metric, then weight. Every number uses the in-app keypad, already filled with the last value; Next chains through the rows, so the system keyboard never opens. Steps are 0.5 cm / 0.25 in, and values can be typed to 0.1. Values outside sane ranges (weight 20–400 kg, sites 5–250 cm) are refused. The date defaults to today and can be changed.
- **Tracked metrics** is a settings page with a switch per metric, grouped as above.
- **Photos page**: a grid by date with a pose filter. Compare picks two dates of one pose and shows them with a Compare slider, plus the weight and waist on each date. ImageViewer gives full screen, zoom and swipe. With **Hide photos** on (the default), thumbnails on Home and the grid are blurred until tapped.
- Photos use the system camera and picker. A "ghost" overlay of the last photo for alignment needs `expo-camera` and is deferred.

### Bodyweight in training numbers

Bodyweight and assisted exercises use the **trend weight on the Session's date**. With no log entries, they fall back to `ui.bodyweightKg`. Once entries exist, that preference shows as "from your weight log". Past Sessions keep the weight they were done at.

### Reminders

Two local notifications, both off by default: a daily weigh-in at a chosen time, and a weekly check-in on a chosen weekday and time. Tapping opens the weight sheet or the Check-in sheet. There are no inline notification actions. Times are wall-clock times wherever the phone is, and a reminder fires even on a day that already has a weigh-in: repeating requests cannot skip one day.

### Components

Copied in by need under [0030](0030-native-component-sourcing.md): PanelUI `Compare`, `ImageViewer`, `Attachment` (upload states), `Kpi`, `WeekStrip` and `Carousel`. TimePicker's swipeable scale is a reference for a later ruler picker. Charts stay our own react-native-svg chart (`platform/ui/charts`).

## Consequences

- Health Connect import later writes `source = 'health'` rows into the same table.
- Changing the trend constant later recomputes every chart, because nothing derived is stored.
- Progress photos are health data: the synthetic-data-only rule holds until the privacy sign-off.
