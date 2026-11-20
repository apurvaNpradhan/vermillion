# 0050. Muscle details and catalog expansion

Status: accepted (2026-11-20). Amends [0034](0034-exercise-library.md) (vocabulary, importer, search, body map) and [0044](0044-muscle-volume-and-stalls.md) (volume breakdown). Builds on [0046](0046-site-admin-closed-beta-and-rename.md) (the database is the catalog's source of truth). Terms: Muscle detail, Catalog patch in [CONTEXT.md](../../CONTEXT.md). Specs: [docs/specs/catalog-expansion/](../specs/catalog-expansion/).

## Context

The catalog has 455 exercises and works at the level of 20 muscle groups. Groups hide differences that change how people train: pressing counts as "shoulders" while side and rear delts get no work, incline and flat chest look the same, and so do straight-knee and bent-knee calf raises. The catalog also misses common variants (cable, single-limb, glute and hip work), has no `cable` equipment (all 40 cable and 11 Smith exercises are tagged `machine`), gives rank 0 to 369 rows so the Popular sort means little, and gives `full_body` as the primary muscle of 48 rows, including the Olympic lifts, whose sets then count toward no goal.

An earlier dataset in the owner's own previous project (7,542 rows, 44 anatomical muscles, 28 equipment kinds, three exercise types, no instructions) shares a media id with 404 of the 455 current rows. Its muscle tags are noisy: 127 rows have no primary, 256 have six or more, 953 titles repeat. Its media is from the same third-party library as the current catalog's, so it does not change the rights position in 0034.

## Decision

### Muscle details

- **23 Muscle details, each inside exactly one existing group.** The 20 group slugs do not change. Groups not listed have no details.

  | Group | Details |
  | --- | --- |
  | chest | `upper_chest`, `lower_chest` |
  | shoulders | `front_delts`, `side_delts`, `rear_delts`, `rotator_cuff` |
  | upper_back | `mid_traps`, `lower_traps`, `teres_major` |
  | biceps | `biceps_brachii`, `brachialis` |
  | forearms | `brachioradialis`, `wrist_flexors`, `wrist_extensors` |
  | abdominals | `rectus_abdominis`, `obliques`, `deep_core` |
  | calves | `gastrocnemius`, `soleus`, `tibialis` |
  | abductors | `glute_medius`, `tfl` |
  | quadriceps | `hip_flexors` |

- **Stored next to the groups, optional.** `exercise.primary_detail text[]` and `exercise.secondary_detail text[]`, default `'{}'`. Every primary detail belongs to the primary group; every secondary detail's group is in `secondary_muscles`. Groups stay the columns everything reads; a row without details behaves as today. Replacing groups with a detail list was rejected: rows without details (Custom exercises, unsplit groups like lats and triceps) would need a fake detail equal to their group, and every group reader would change.
- **The vocabulary is code** (`MUSCLE_DETAILS`, detail → group), with i18n keys and search aliases ("rear delt", "posterior delt"). Clients drop detail slugs they do not know instead of rejecting the row, so a later detail does not need an app release first.

### Where details are used

- **Volume.** Goals stay per group. The Muscles screen shows a breakdown inside each group: a set's 1 (primary) is split equally across its primary details, its 0.5 per secondary group is split equally across that group's secondary details, and anything without details is "unspecified". The breakdown therefore adds up to the group total.
- **Body map.** Each detail maps to its own art layers (table in the slice D spec; `front_iliopsoas` comes from the spike's interim set for `hip_flexors`). An exercise with details lights only those layers; without, the whole group as today. Filter taps keep selecting groups. Layers that belong to no detail (sartorius, popliteus, serratus) light only with the whole group. The commissioned art (0034's licence gate) is drawn at detail level.
- **Search.** A typed token that matches a detail's label or alias also matches rows carrying that detail, for catalog and Custom exercises alike. Filters stay per group.
- **Swap for.** Same primary group and other equipment, as before, ranked by overlap of primary details first.
- **Display.** Exercise detail shows detail chips; list rows, the Session screen and share cards keep groups.
- **Custom exercises.** An optional "Which part?" pick after the group, only for groups that have details.

### Equipment and bars

- Four equipment kinds: `cable`, `smith_machine`, `ez_bar`, `trap_bar` (additive `CHECK`). The 40 cable and 11 Smith rows are retagged; ids and exercise types do not change.
- The plate calculator opens an `ez_bar` exercise on the kit bar labelled "EZ" and a `trap_bar` exercise on one labelled "Trap"; a remembered bar still wins. The default kit gains a Trap bar (25 kg / 55 lb); existing kits are not changed, and the calculator suggests adding one when it is missing.

### Catalog patches

- **A Catalog patch is a committed, ordered, validated file of changes to Reference data**, applied once (fingerprinted per file in `reference_import`). It inserts new catalog rows and fills empty fields of existing ones; it never deletes and never overwrites a value the admin may have set. A deliberate change to a set value (a retag, a new primary group, a rank) carries the value it expects to replace and is applied only if the row still holds it; otherwise it is skipped and reported.
- Patches run on server start after the seed, and again when `minimum_app_version` is raised. A patch that introduces slugs older apps reject declares `requires_app_version`; it waits until the minimum reaches it (in production; development applies it at once). Release order: ship the app, raise the minimum, the patch applies.
- The seed file is unchanged; a fresh database is the seed plus every patch.

### Expansion content

- Candidates come from the earlier dataset, filtered: strength and conditioning only (no stretching, yoga, pilates, rolling, warm-up drills, vibrate plate), a video present, one per movement across male/female/version duplicates. Ids are kept. Mapping rules for muscles, types, equipment and titles are in the slice B spec; the main mover becomes the primary group (legs and hips, then back, chest, shoulders, arms, core) and the owner can override it.
- The owner approves every new row, every detail backfill and every rank tier on one review page; nothing enters a patch unreviewed.
- New rows get instructions written by us. Their media is copied into the exercise media bucket under `exercises/v2/` (thumbnails as WebP). The existing 455 keep their media until the two are compared.
- All catalog rows get a tiered rank. Olympic lifts and the Overhead Squat get a real primary group; `full_body` stays for conditioning only.

## Consequences

- One additive migration (two array columns, wider `CHECK`s). The client `exercise` table gains two JSON text columns.
- A detail added later is code, an i18n key and art, with no release gate. An equipment kind added later still needs one.
- The catalog grows from 455 to roughly 700–1,000 rows: about 1–1.5 MB per device and about 20 MB of thumbnails prefetched on Wi-Fi.
- Data rights are unchanged: the added rows and media are third-party development fixtures under 0034's amendment until replaced or licensed.
