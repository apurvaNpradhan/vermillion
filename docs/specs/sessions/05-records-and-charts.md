# Sessions, slice 5: Records, charts, exercise page, muscles and Workout preview

Status: ready after slice 4. Decisions: [ADR 0038](../../adr/0038-sessions.md) (Numbers; Exercise page and Workout preview). Read [the PanelUI review](../../panelui-review.md). Headers follow the existing fade-header motion (no frosted header).

## Goal

The numbers the app has collected become visible: per-exercise trends and Records, per-Workout trends, and muscle distribution. The exercise page becomes the hero-first adaptive scroll.

## Work

- **Charts** (`apps/native/src/platform/ui/charts/`): a `LineChart` and a `BarChart` on `react-native-svg` with Reanimated. Scrubbing shows a value label, axes use tabular digits, colours come from brand tokens, and there are empty and one-point states. A range chip offers 3M, 1Y and All. PanelUI attribution goes in the file header and `docs/licenses/`.
- **Exercise page**:
  - The hero media runs under a transparent header. The header background and title fade in over the first 120 pt of scroll, so the camera cutout overlaps the image only.
  - The numbers section has metric chips (Heaviest, Est. 1RM, Best set volume, Session volume, Total reps; or Duration, Distance, Pace for those types) over a chart of one point per Session.
  - Records: a list with values and dates, and a "?" sheet defining each record and the warm-up exclusion.
  - Recent: the last 3 Sessions as compact set rows; See all opens `/exercises/[id]/history`.
  - Then How to and Swap for. With no history, How to rises and the numbers collapse to one line.
- **Muscle distribution**: a sheet opened from the session header's body icon, and a section in Session detail. The body map uses intensity mode with a 0–max scale, and the ranked bars are labelled "sets".
- **Workout preview** (`/train/workout/[id]` becomes the preview; the editor moves to `/train/workout/[id]/edit`):
  - title, "Last done 3 days ago" and a **Start** primary button
  - a Volume / Reps / Duration chart across Sessions from this Workout
  - exercise summaries with "Last: 60 × 8, 8, 7"
  - Edit in the header

  Update the links in Train and Programs, and remove slice 2's temporary Start.

## Tests

- Unit: chart scale and tick helpers, per-Session metric series per exercise type, and the "last done" relative label.
- Manual: hero and header fade on a phone with a camera cutout; chart scrubbing; the empty exercise page; a Record defined in the help sheet matching the computed one.

## Done

The standard checks pass and the manual checks are recorded.
