# Catalog gaps

Exercises that were needed for a real plan but are missing from (or modelled awkwardly in) the
Reference catalog. Each one exists today as a Custom exercise on the account that needed it.
When adding one to the catalog, migrate the plan rows from the custom id to the catalog id.

Found while building the Upper/Lower + PPL programs (2026-11-16).

## Missing exercises (created as Custom exercises)

| Exercise                 | Type      | Primary muscle | Equipment | Why it matters                               |
| ------------------------ | --------- | -------------- | --------- | -------------------------------------------- |
| Bayesian Curl (Cable)    | weight    | biceps         | machine   | Staple lengthened-bias biceps curl (Nippard) |
| Doorway Pec Stretch      | duration  | chest          | none      | Post-push stretch                            |
| Couch Stretch            | duration  | quadriceps     | none      | Hip flexor / quad stretch after lower days   |
| Seated Hamstring Stretch | duration  | hamstrings     | none      | Post-hinge stretch                           |
| 90/90 Hip Stretch        | duration  | glutes         | none      | Hip mobility                                 |
| Standing Calf Stretch    | duration  | calves         | none      | Post-calf-raise stretch                      |
| Cat-Cow                  | reps only | lower_back     | none      | Spinal mobility warm-up                      |

## Missing, worked around without a custom exercise

- **EZ-Bar Preacher Curl**: used `Preacher Curl (Barbell)` with a note to use an EZ bar.
- **Incline Treadmill Walk**: used `Treadmill` with incline and speed in the note. An "Incline
  Walk" entry, or an incline field, would be clearer.
- **Nippard warm-up drills**: Leg Swings (front/back, side/side), Prone Trap Raise, Cable
  External/Internal Rotation, Overhead Shrug, Standing Glute Squeeze. Written into workout notes
  for now.
- **Constant-tension / lengthened-partial variants** (e.g. calf raises with lengthened partials,
  cable fly 21s): expressed in notes, not as separate exercises. A per-set "technique" tag might
  suit these better than new exercises.
- **Specific stretches more broadly**: the catalog has only a generic `Stretching` (duration).
  A small stretch and mobility set (pec, lat, hip flexor, hamstring, glute, calf, thoracic) would
  cover most plans.

## Modelling notes

- `Pull Up (Weighted)` is `bodyweight_reps`, so a Planned set cannot carry the added load as a
  target. Fine for now (load is logged), but worth checking that the logged added weight shows
  in history and records.
- Per-side work (stretches, Pallof press, single-arm raises) has no "per side" flag; plans say it
  in the note.
