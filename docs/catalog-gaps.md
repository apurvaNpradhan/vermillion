# Catalog gaps

Exercises that were needed for a real plan but are missing from (or modelled awkwardly in) the
Reference catalog. Each missing one exists today as a Custom exercise on the account that needed
it. When adding one to the catalog, migrate the plan rows from the custom id to the catalog id.

Last checked against production on 2026-11-24, after the three Catalog patches (expansion
included) were applied there: 923 live catalog exercises. Found while building the 6-day
PPL + Upper/Lower and the 4-day Upper/Lower fat-loss Programs.

## Covered by patch 0004 (gaps and staples)

Patch `0004-gaps-and-staples.json` adds all of the below to the Reference catalog (47 rows). Migrate
plan rows from each Custom exercise to the catalog id when the patch is live. The stretches are
`duration`; Cat-Cow, Thoracic Open Book and the drills are `reps_only`.

| Was a Custom exercise    | Catalog title              |
| ------------------------ | -------------------------- |
| Cat-Cow                  | `Cat-Cow`                  |
| Thoracic Open Book       | `Thoracic Open Book`       |
| 90/90 Hip Stretch        | `90/90 Hip Stretch`        |
| Couch Stretch            | `Couch Stretch`            |
| Doorway Pec Stretch      | `Doorway Pec Stretch`      |
| Seated Hamstring Stretch | `Seated Hamstring Stretch` |
| Standing Calf Stretch    | `Standing Calf Stretch`    |
| Child's Pose             | `Child's Pose`             |

The Nippard warm-up drills now exist too: `Front-to-Back Leg Swing`, `Side-to-Side Leg Swing`,
`Prone Single-Arm Trap Raise` and `Standing Glute Squeeze`. The same patch adds the strength and
mobility lists from the Gyms, phases and Train round (see its section 6), and the no-media staples
(Copenhagen plank, reverse Nordic, Spanish squat, safety-bar squat, Kelso shrug, Lu raise, Kroc
row, Helms row, Spoto press). Foam rolling stays out on purpose.

Media: 24 of the 47 rows have a video and thumbnail from the old dataset, 9 have a thumbnail only,
and 14 have none (Standing Glute Squeeze, 90/90 Hip Stretch, Side-to-Side Leg Swing, Snatch-Grip
Shrug, Thread the Needle and the nine staples above). Thread the Needle's source file name has a
space, which a media key cannot hold; rename it in the bucket to add its media later.

Ops after the patch is live: run `pnpm catalog:media --patch
packages/api/src/exercise/data/patches/0004-gaps-and-staples.json --candidates
scripts/catalog/expansion/0004-media-sources.json --out <dir>` with the source and exercise-media
bucket credentials. It copies each row's thumbnail and video to `exercises/v2/`; rows with no
source are not in the candidates file and are not touched. Until it runs, the new rows show
without media (the patch only stores the keys).

## Missing, worked around without a custom exercise

- **Constant-tension and lengthened-partial variants** (calf raises with lengthened partials,
  cable fly 21s): expressed in notes, not as separate exercises. A per-set "technique" tag might
  suit these better than new exercises.

## Resolved by the expansion

- **Bayesian curl**: `Behind the Back Curl (Cable)`, now with "Bayesian Curl" as its alias
  (patch 0004).
- **EZ-bar preacher curl**: `Preacher Curl (EZ Bar)`.
- **Incline treadmill walk**: `Incline Treadmill Walk (Machine)`.
- **Dead hang**: `Dead Hang`.
- **Reverse pec deck**: `Rear Delt Reverse Fly (Machine)`, now with "Reverse Pec Deck" as its
  alias (patch 0004).
- **Close-grip cable row**: `Seated Cable Row - V Grip (Cable)`.
- **Cable overhead shrug and rotations**: `Overhead Shrug (Barbell)`,
  `Shoulder External Rotation (Cable)`, `Shoulder Internal Rotation (Cable)`.
- **Tate press, Larsen press, KAS glute bridge**: `Tate Press (Dumbbell)` is new in patch 0004;
  `Feet Up Bench Press (Barbell)` and `Partial Glute Bridge (Barbell)` carry the Larsen press and
  KAS glute bridge aliases.

## Modelling notes

- Per-side work (stretches, Pallof press, single-arm raises) has no "per side" flag; plans say it
  in the note.
- `Pull Up (Weighted)` is `bodyweight_weighted_reps`, so a Planned set can carry the added load.
