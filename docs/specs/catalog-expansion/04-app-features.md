# Catalog expansion, slice D: Muscle details and new equipment in the app

Status: ready after slice A is merged; runs alongside B and C. Decisions: [ADR 0050](../../adr/0050-muscle-details-and-catalog-expansion.md). Read [ui](../../../.agents/ui.md), [data-flow](../../../.agents/data-flow.md), [i18n](../../../.agents/i18n.md) and [verticals](../../../.agents/verticals.md) first. Develop against a local database with a hand-written patch fixture that gives a dozen rows details and new equipment.

## Goal

Details show where ADR 0050 says, rows without details look exactly as today, and the new equipment kinds work end to end.

## Work

### Body map (`apps/native/src/body-map/`)

- Copy `front_iliopsoas.webp` from `~/Workspace/projects/vermillion/packages/body-map/assets/interim/` into `assets/interim/`; regenerate `layer-sources.generated.ts` and hit masks with `generate-assets.ts`. Add it to `GROUP_LAYERS.quadriceps.front`.
- `DETAIL_LAYERS: Record<MuscleDetail, Record<BodyView, readonly string[]>>`:

  | Detail | Front | Back |
  | --- | --- | --- |
  | front_delts | front_deltoid_anterior | |
  | side_delts | front_deltoid_lateral | |
  | rear_delts | | back_deltoids |
  | rotator_cuff | | back_infraspinatus, back_teres_minor |
  | upper_chest / lower_chest | front_chest_clavicular_head / front_chest | |
  | mid_traps / lower_traps / teres_major | | back_middle_trapezius / back_lower_trapezius / back_teres_major |
  | biceps_brachii / brachialis | front_biceps / front_brachialis | back_biceps / back_brachialis |
  | brachioradialis | front_brachioradialis | |
  | wrist_flexors / wrist_extensors | / front_wrist_extensors | back_wrist_flexors / |
  | rectus_abdominis / obliques | front_rectus_abdominis / front_obliques | / back_obliques |
  | deep_core | (none, listed only) | |
  | gastrocnemius / soleus | front_gastrocnemius / front_soleus | back_gastrocnemius / back_soleus |
  | tibialis | front_tibias | |
  | glute_medius / tfl | / front_tensor_fasciae_latae | back_gluteus_medius / |
  | hip_flexors | front_iliopsoas | |

  A test asserts each detail's layers are a subset of its group's layers.
- `BodyMap` accepts highlights that are either groups or details (one input type, e.g. `{ groups, details }` with opacity per entry). An exercise with details lights its details' layers (primary full, secondary faded as today) plus, for groups with no details, the whole group. Taps still report a group.

### Volume breakdown (`packages/shared/src/training/volume/`)

- `detailDistribution(sets, exercises)` alongside `muscleDistribution`: per group, the split described in ADR 0050 (primary 1 split across primary details, 0.5 per secondary group split across that group's secondary details, the rest `unspecified`). Unit tests: sums equal the group totals; rows without details are all `unspecified`.
- Muscles screen: each group row with details expands (or shows a second line) to "front 9 · side 3 · rear 2", leaving out zero parts and showing unspecified only when non-zero. Goals unchanged.

### Exercise detail

- Detail chips under the muscle section ("Side delts", "Front delts"); primary first. The detail body map uses details.
- "Swap for": same primary group, other equipment; order by count of shared primary details (descending), then the existing order.

### Search (`packages/sync/src/exercise/library-query.ts`)

- For each typed token, find details whose label or alias contains it (shared helper `detailsMatching(token)`); the token's clause becomes `(title/aka/search_terms LIKE …) OR primary_detail LIKE '%"<slug>"%' OR secondary_detail LIKE '%"<slug>"%'` for each matched slug. Applies to catalog and Custom rows. Tests in `library-query.test.ts`: "rear delt" finds a row with `rear_delts` and no matching title.

### Custom exercise form (`apps/native/src/exercise/form/`)

- After the primary group (and for each chosen secondary group) with details, an optional "Which part?" multi-select of that group's details; skippable, cleared when the group changes. Draft and validation use `hasValidDetails`.
- Equipment picker shows the four new kinds (icons from the existing set; ask before adding new icon assets).

### Plate calculator (`apps/native/src/session/plates/`, `packages/shared/src/training/plates/gym-kit.ts`)

- Default kit gains a Trap bar: kg 25, lb 55, label "Trap". Existing kits unchanged.
- `defaultBar` takes the exercise's equipment: `ez_bar` → enabled bar labelled "EZ", `trap_bar` → enabled bar labelled "Trap"; the remembered bar still wins; otherwise today's rule. If the labelled bar is missing, the sheet shows a one-line hint linking to Manage equipment.
- Labels are matched case-insensitively; tests for each case.

### Equipment filter and labels

- The filter sheet's equipment grid shows 13 kinds; check layout at phone width. List rows show the new labels.

## Tests

Unit: detail layers subset, `detailDistribution`, search matching, `defaultBar` with equipment, form draft validation with details. Existing body-map and volume tests still pass unchanged for rows without details.

## Done

`pnpm lint`, `typecheck`, `knip`, `test`, `i18n:check` pass. On the fixture database: a lateral raise lights only the side delt; the Muscles screen shows the shoulder breakdown; "rear delt" search finds face pulls; an EZ curl opens on the EZ bar. Version bumped in `app.config.ts`; that version is the `requires_app_version` of patch 0001.
