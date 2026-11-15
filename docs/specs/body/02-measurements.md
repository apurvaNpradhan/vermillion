# Body, slice 2: measurements and Check-in

Status: ready after body slice 1. Decisions: [ADR 0041](../../adr/0041-body-metrics.md).

## Goal

Users choose what to measure, log a Check-in in one sheet without the system keyboard, and read each metric's history.

## Work

- **Tracked metrics** settings page (`settings/tracked-metrics`): grouped switches (Upper body, Arms, Legs); writes `ui.trackedMetrics`. Height row (needed for waist-to-height) here and in Profile.
- **Check-in sheet** (no photos yet; slice 3 adds pose slots at the top): one row per tracked metric then weight, each opening the keypad filled with that metric's last value; Next chains row to row, Done saves. Steps 0.5 cm / 0.25 in, typed to 0.1; weight steps as slice 1. Date row (default today). Save calls `logMeasurements` once. Untouched rows are not written.
- **Measurements page** `body/measurements`: two-column tiles per group, only tracked metrics; each tile: name, last-7 sparkline, latest value + unit, change since previous entry in neutral colour with an arrow. Ratios group (waist-to-height needs height and waist; waist-to-hip needs waist and hips; hidden otherwise). A "Check-in" primary action. A first tile slot reserved for the latest progress photo (filled in slice 3).
- **Metric page** `body/metric/[metric]`: chart (points joined, no smoothing), ranges as Weight, entries list with edit/delete.
- **Home**: Measurements card (latest Check-in date, up to 3 changed metrics) and Weigh-in habit card (30-day grid, PanelUI `WeekStrip`/grid ideas), after the muscles card.
- Pure helpers with tests: `ratios(latest, heightCm)`, `changeSincePrevious(entries)`, `lastN(entries, 7)`.

## Tests

- Unit: helpers above, unit conversion round trips for cm/in.
- Seam 1: batch log via the handler with one bad row refuses only that row.

## Done when

Checks pass; on device a full Check-in of 6 metrics takes no system keyboard and shows on the page.
