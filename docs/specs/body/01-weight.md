# Body, slice 1: data, trend and weight

Status: ready (independent of media). Decisions: [ADR 0041](../../adr/0041-body-metrics.md). Read [sync](../../../.agents/sync.md), [database](../../../.agents/database.md), [data-flow](../../../.agents/data-flow.md), [ui](../../../.agents/ui.md), [i18n](../../../.agents/i18n.md) and [adding a synced table](../../guides/adding-a-synced-table.md). New vertical: `body` (api, sync, native).

## Goal

A user logs weight in two taps from Home, sees a MacroFactor-grade trend page, and bodyweight exercises use the trend weight on each Session's date.

## Work

### Vocabulary (`packages/shared/src/body.ts`)

- `BODY_METRICS` (weight, neck, shoulders, chest, waist, hips, left_bicep, right_bicep, left_forearm, right_forearm, left_thigh, right_thigh, left_calf, right_calf), groups (upper, arms, legs), `DEFAULT_TRACKED_METRICS` (waist, chest, both biceps, both thighs), `BODY_LIMITS` (weight 20–400 kg, sites 5–250 cm, no future dates, 10-year backfill).
- `ui` preferences: `lengthUnit` (`cm | in`; default derived from the weight unit when unset), `heightCm` (100–250, nullable), `trackedMetrics`, `weightGoalKg` (nullable).
- Pure functions in `packages/shared/src/body/` with tests:
  - `dailyWeights(entries)` → one value per `local_date` (average).
  - `trendSeries(daily, alpha = 0.1)` → per-day `{ date, scale | null, trend, interpolated }`, linear interpolation over gaps, EWMA seeded with day one.
  - `trendAt(series, date)` (last trend on or before date), `changeOver(series, days)`, `ratePerWeek(series)` (least-squares slope of the last 14 trend days), `weightChanges(series)` for 3/7/14/30/90 with `increase | decrease | stable` (±0.1 kg).
  - `weeklyPoints(series)` for 1Y/All.
  - `weighInDays(entries, today, 30)` for the habit grid.
  - Unit conversion helpers kg↔lb, cm↔in with display rounding.

### Postgres and sync

- `body_measurement` table per the ADR, `CHECK`s on metric and value ranges by metric, index `(user_id, metric, local_date desc) WHERE deleted_at IS NULL`. Publication + grant in the migration.
- Stream `my_body` (`body_measurement` now; `progress_photo` joins in slice 3). Client table, local index `(metric, local_date)`. Parity test passes.
- Handler: refuses foreign rows, unknown metric, out-of-range values, future or too-old dates; soft delete, 120-day purge like the others.
- Store `packages/sync/src/body/store.ts`: `logMeasurement`, `logMeasurements(entries[])` (one transaction, used by Check-in later), `updateMeasurement`, `deleteMeasurement`, `restoreMeasurement`. Watches: `watchMetric(metric, from?)`, `watchLatestByMetric()`, `watchWeighInDays(from)`.

### Native (`apps/native/src/body/`, routes `app/(app)/body/`)

- Module hooks: `use-weight` (series, trend now, changes, rate, entries by month), `use-log-weight`.
- **Weight quick-log sheet**: keypad (reuse the session keypad pattern; ±0.1 kg / 0.2 lb), filled with the latest trend value, date/time row defaulting to now, Save. Range errors inline.
- **Home Weight card** right after Next up: trend now, change over 30 days, 30-day sparkline, "Log weight" button. Empty state invites the first entry.
- **Weight page** `body/weight`: header (trend now, change over range, rate/week, date range — use a `Kpi`-style block, PanelUI `Kpi` copied in per ADR 0030); chart on `platform/ui/charts` extended for two series (faint scale line, bold trend with dots, dashed goal line), scrub readout showing both values; ranges 1W/1M/3M/6M/1Y/All (segmented control), weekly points for 1Y/All; Weight changes table (mini sparkline, value, direction); 30-day weigh-in grid; entries by month with tap-to-edit and swipe-to-delete with Undo; info sheet explaining scale vs trend; goal weight set from the page's ⋮ menu.
- **Bodyweight in numbers**: where `ui.bodyweightKg` is passed into volume/records (`use-home-training`, exercise detail numbers, session summary/records), pass `trendAt(series, session local date)` when the log has entries, else the preference. Settings shows "from your weight log" when entries exist.
- i18n for every string, brand tokens only, neutral colours for change.

## Tests

- Unit: every pure function (gaps, single entry, multiple per day, interpolation flags, stable threshold, unit conversion, weekly points).
- Seam 1: handler refusals and soft delete.
- Seam 3: a weight logged offline reaches a second device; isolation.

## Done when

Checks pass; on device: two-tap log from Home, trend page with all sections, bodyweight volume uses the log.
