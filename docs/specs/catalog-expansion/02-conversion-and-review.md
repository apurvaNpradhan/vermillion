# Catalog expansion, slice B: conversion dry-run and the review page

Status: ready after slice A's vocabulary is merged. Decisions: [ADR 0050](../../adr/0050-muscle-details-and-catalog-expansion.md). Scripts only; no app code.

## Goal

A repeatable script turns the earlier dataset into three proposal files (detail backfill for the 455, new-row candidates, rank tiers), and a private review page lets the owner approve, reject or edit each proposal. A second script turns the approved decisions into Catalog patch files.

## Inputs

- Earlier dataset: `~/Workspace/projects/callus/apps/api/src/exercise/data/` (`exercises.jsonl`, `muscles.json`, `equipment.json`, `body_parts.json`). Path is an argument; nothing from it is committed except what ends up in patches.
- Current catalog: `packages/api/src/exercise/data/exercises.json`.

## Work

### `scripts/catalog/propose-expansion.ts <dataset-dir> <out-dir>`

Writes `backfill.json`, `candidates.json`, `ranks.json` to `<out-dir>` (a scratch directory, not committed). Generic names only; no source product names in code or comments.

**Join.** The media file name's first four digits are the shared movement id (`/(\d{4})\d{4}-/`). Match current rows by `video_key` or `thumbnail_key`; an old movement may match several rows (keep the closest title).

**Muscle mapping** (old → detail, else group only):

| Old | Detail (group) |
| --- | --- |
| `PECTORALIS_MAJOR_STERNAL_HEAD` / `_CLAVICULAR_HEAD` | `lower_chest` / `upper_chest` |
| `DELTOID_ANTERIOR` / `_LATERAL` / `_POSTERIOR` | `front_delts` / `side_delts` / `rear_delts` |
| `INFRASPINATUS`, `TERES_MINOR`, `SUBSCAPULARIS` | `rotator_cuff` |
| `TRAPEZIUS_UPPER_FIBERS` | group `traps`, no detail |
| `TRAPEZIUS_MIDDLE_FIBERS` / `_LOWER_FIBERS` | `mid_traps` / `lower_traps` |
| `TERES_MAJOR` | `teres_major` |
| `BICEPS_BRACHII`, `BRACHIALIS`, `BRACHIORADIALIS` | same names |
| `WRIST_FLEXORS` / `WRIST_EXTENSORS` | same names |
| `RECTUS_ABDOMINIS`, `OBLIQUES` / `TRANSVERSE_ABDOMINUS` | same / `deep_core` |
| `GASTROCNEMIUS`, `SOLEUS` / `TIBIALIS_ANTERIOR` | same / `tibialis` |
| `GLUTEUS_MEDIUS`, `GLUTEUS_MINIMUS` / `TENSOR_FASCIAE_LATAE` | `glute_medius` / `tfl` |
| `ILIOPSOAS` | `hip_flexors` |
| `GLUTEUS_MAXIMUS`, `QUADRICEPS`, `HAMSTRINGS`, `LATISSIMUS_DORSI`, `TRICEPS_BRACHII`, `ERECTOR_SPINAE`, `ADDUCTOR_*`, `STERNOCLEIDOMASTOID`, `SERRATUS_ANTERIOR` | group only (`glutes`, `quadriceps`, `hamstrings`, `lats`, `triceps`, `lower_back`, `adductors`, `neck`, `chest`) |
| `SARTORIUS`, `PECTINEOUS`, `GRACILIS`, `POPLITEUS`, `SPLENIUS`, `LEVATOR_SCAPULAE`, `DEEP_HIP_EXTERNAL_ROTATORS` | group only (`quadriceps`, `adductors`, `adductors`, `calves`, `neck`, `traps`, `glutes`) |

Cleaning: drop `rotator_cuff` as a secondary on compound presses, pulls and rows (title or primary heuristics; list what was dropped per row). Flag rows with more than 3 primary details.

**Backfill (455).** For each matched row: details from the old row, kept only where the detail's group is already the row's primary group (→ `primary_detail`) or in its `secondary_muscles` (→ `secondary_detail`). Never change groups. Separately propose:
- equipment retags: `cable` for cable titles/old Cable, `smith_machine` for Smith, `ez_bar`, `trap_bar`;
- a real primary for `full_body` rows that are lifts (Olympic lifts, Overhead Squat, Landmine Squat and Press, high pulls), with secondaries; conditioning rows stay `full_body`.
Unmatched rows (about 51) are listed with empty proposals for hand tagging on the page.

**Candidates.** Old rows not matched to the catalog, filtered: exercise type known; a video present; body part not Stretching/Yoga; title not matching stretch, yoga, pose, pilates, massage, roll(ing) on foam/ball/stick, warm-up, vibrate; 1–3 primary muscles after mapping. Collapse duplicates by normalised title (drop `(male)`, `(female)`, `(VERSION n)`, extra spaces; keep the one with a video, then the plain name). Each candidate carries:
- `id` (old id kept), `source_title`, suggested `title` ("Movement (Equipment)", Title Case, "Lever" → "(Machine)", gender/version stripped), `aka` when the source title differs a lot;
- `primary_muscle` by heuristic (first of legs and hips → back → chest → shoulders → arms → core among the mapped primaries), other primaries → secondary; details as above;
- `equipment` (old 28 → 13: Leverage/Sled machine/Assisted → `machine`; Smith → `smith_machine`; Cable/Rope → `cable`; Barbell/Olympic barbell → `barbell`; EZ Barbell → `ez_bar`; Trap bar → `trap_bar`; Body weight → `none`; Band/Resistance Band → `resistance_band`; Weighted → `plate`; Suspension → `suspension`; Dumbbell, Kettlebell same; the rest → `other`);
- `exercise_type` (Body weight → `bodyweight_reps`; Assisted → `bodyweight_assisted_reps`; Weighted → `bodyweight_weighted_reps`; Band → `reps_only`; sled/carry titles → `short_distance_weight`; else the old type);
- `is_full_bodyweight` for bodyweight types; media keys of the source (copied in slice C); `flags` (too many primaries, title collision, guessed type).
- Sorted by group, then equipment, then title. Report counts by group and equipment.

**Ranks.** Every current row and every candidate gets a proposed tier: 1 staple (the big compound lifts, pulldowns, rows, curls, presses, raises, leg press/extension/curl), 2 common, 3 variant, 4 niche. Tier → rank value: 100 / 60 / 30 / 10 (higher first; existing non-zero ranks kept as the default when they disagree and flagged).

### Review page (published by the lead, not a subagent)

- One private artifact with a shared data store: tabs **Backfill**, **Candidates**, **Ranks**. Data from the three JSON files is uploaded with it.
- Each row: thumbnail (signed or public URL from the current media base or the source bucket), suggested values, flags. Actions: approve, reject, edit (title, primary group, details, equipment, type, tier). Filters by group, equipment, flag and decision state; counts at the top.
- Decisions are saved per row in the store; the lead reads them back. Nothing local or exported by hand.

### `scripts/catalog/build-patches.ts <decisions.json> <proposals-dir>`

- Reads the decisions (pulled from the review page's store by the lead into a scratch file) and writes:
  - `0001-muscle-details-and-equipment.json`: `fill` for approved backfill details; `change` for approved retags and `full_body` primaries; `requires_app_version` = the slice D release.
  - `0002-expansion.json`: `insert` for approved candidates (instructions and media keys added in slice C).
  - `0003-ranks.json`: `fill`/`change` for ranks.
- Runs the slice A validator over the result against the current seed; fails on any error.

## Tests

Unit tests for the pure parts (movement id parsing, muscle mapping, title cleaning, type and equipment mapping, duplicate collapsing, primary heuristic) with small inline fixtures. No test reads the external dataset.

## Done

The script runs end to end on the dataset and prints counts; the review page is published with all three tabs; lint, typecheck and knip pass.
