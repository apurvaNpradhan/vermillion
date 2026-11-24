# Gyms, available loads and swaps: how other apps do it, and what Sigil should change

Researched 2026-11-24 for `docs/specs/training/gyms-phases-train-round.md` sections 3 and 5. Not committed.

Source quality: Alpha Progression pages were read in full. MacroFactor pages were read in full.
Liftosaur's Liftoscript page was read. Fitbod help pages returned 403 to our fetcher, so the Fitbod
claims come from search-result summaries of its help center and are marked *(snippet)*. Hevy, Strong
(on these topics), Boostcamp, JuggernautAI and RP had no readable official page. The Steady
app was not found as a primary source; the only match is a store/listing description *(snippet)*.
Where a claim is absent below, assume "not documented", not "not supported".

## 1. Per-app findings

**Alpha Progression** (closest to our plan; Pro for multiple gyms)
- A gym profile is "a saved configuration of the equipment and weights available at a particular
  training location"; one active gym; multiple profiles are Pro.
  https://alphaprogression.com/en/glossary/gym-profile
- Available weights are "one or more weight ranges, each consisting of a minimum and a maximum
  value, as well as an interval", combinable (dumbbell rack: 1 to 10 kg in 1 kg, then 10 to 50 kg
  in 2 or 2.5 kg). Barbell kit is bar weight plus plate sizes and quantities. Machines can each
  have their own loads: "One specific machine may have a completely different set of available loads
  from all other machines at your gym."
  https://alphaprogression.com/en/glossary/available-weights and
  https://alphaprogression.com/en/blog/alpha-progression-guide
- Progression uses the real weights: "a realistic combination of weight and reps instead of
  pretending you can use a load that does not exist". At 7.5 kg with 10 kg next, it recommends more
  reps at 7.5 first and works out when 10 becomes appropriate; reps may "sit above or below the
  planned target when the available increment makes that more practical". If the plates cannot make
  the target, the plate calculator shows the next lower achievable weight. Behaviour at the top of a
  range is not documented. (guide, above)
- Equipment per gym filters the exercise database, replacement lists and plan generators. Custom
  exercises stay visible. Whitelist/blacklist per exercise overrides the equipment filter. Units can
  be overridden per gym and per exercise. (gym-profile glossary)
- Replace: shows "a list of similar exercises ... similar movement but with different equipment".
  Ranking, and whether loads carry over, are not documented; a trained exercise "receives
  recommendations immediately" from its own history. Glossary advice: record each variation
  separately unless setup is genuinely equivalent. https://alphaprogression.com/en/glossary/exercise-substitution
- Bodyweight: per-exercise "bodyweight involvement (0-100%)"; added load is tracked alone; assistance
  is a negative number (example -15 kg). Per-side vs total is a per-exercise convention in the
  exercise instructions (split squat: total; curl: one dumbbell). (guide)
- Machine setup: free-text notes, pinnable so they show every time. No structured seat/pin fields.
  Warns that two machines with the same stack number can feel different. (guide, gym-profile)

**MacroFactor Workouts** (strongest on machine stacks)
- Per-machine stack ranges entered as start, end, increment, stackable (15 to 25 lb by 5, then 25 to
  55 lb by 10). Micro-adjustments are a separate typed concept: Dial, Selectorized Pin, External
  Plates. https://help.macrofactorapp.com/en/articles/403-how-to-configure-weight-stack-ranges-for-pin-loaded-machines
- "only recommends weights that match the equipment you indicate", rounds "to the nearest available
  option"; fractional plates can be unticked per gym profile. Increments are per gym, not per
  exercise. Some exercises include bodyweight and machine starting resistance, giving odd decimals.
  https://help.macrofactorapp.com/en/articles/390-how-to-change-equipment-settings-to-simplify-weight-recommendations
- Gym profiles have "Allow Exercises" (usable even if equipment missing) and "Disallow Exercises"
  (never recommended). https://help.macrofactorapp.com/en/articles/300-set-up-your-gym-profiles
- Stack-max behaviour and swap carry-over: not stated on pages read.

**Liftosaur**
- Equipment settings (Me, Equipment) have "Bodyweight for Bar" and "Is assisting?" (plates reduce
  the total) per equipment type. https://www.liftosaur.com/doc/liftoscript
- `increment()` "will take into account the available plates, or what's the next fixed weight on the
  equipment"; `roundWeight` rounds to the nearest valid plate increment. Plain `lp(5lb)` progressions
  are not documented as snapping, so snapping is explicit in scripts. (same page)
- Variation ladders share sets, reps, weights and progress logic across movements; percentage and RPE
  weights resolve against the current variation's own 1RM. (same page)
- Gyms, cable ratios and per-side load were not in the pages read.

**Fitbod** *(snippets of help.fitbod.me, not read directly)*
- Multiple gym locations, each with its own equipment. For dumbbells, kettlebells and barbells the
  user can "specify which weight increments you have" (Edit next to the equipment type).
  https://help.fitbod.me/hc/en-us/sections/360012732693-Feature-Overview
- Displayed dumbbell weight is per dumbbell, not combined. Replace draws from the same muscle group,
  filterable by available equipment; replacing "re-calculates the reps and weight"; weights come from
  an estimated 1RM, seeded for new exercises from similar users; a "Normalize Weights" option and a
  "Can't find weight match" message exist (iOS) when two exercises' weights are too far apart.
  https://fitbod.me/blog/fitbod-algorithm and https://fitbod.me/blog/estimated-strength/

**Steady (Increment)** *(listing only)*: described as suggesting only weights the gym can load from
bar, plates and "each machine's smallest jump", with per-gym equipment and increments.
https://alternativeto.net/software/steady-increment/about/

**Hevy, Strong, Boostcamp, JuggernautAI, RP**: nothing readable. Strong documents only a manual
"merge data between exercises" within one category: https://help.strongapp.io/article/209-how-do-i-merge-data-between-two-exercises.
JuggernautAI lets users swap per day or block, no load rule documented (garagegymreviews.com/juggernautai-review).

## 2. Patterns

1. **Ranges beat step + cap.** Alpha and MacroFactor model loads as a list of `(min, max, interval)`
   ranges per equipment item. That expresses stack cap, uneven steps (1 kg to 10 kg, then 2.5 kg),
   and micro-adds in one structure. Our `max_load` + `load_step` is the degenerate one-range case.
2. **Machines are per-machine, not per-type.** Alpha and MacroFactor keep loads per machine. Sigil's
   `gym_exercise_setting` (gym, exercise) is equivalent in effect; fine.
3. **Progression snaps to loadable and trades load for reps** when the next load is a big jump
   (Alpha). Ours snaps to a generic step only.
4. **Micro-adds are a distinct concept** (MacroFactor: pin/dial/external plates). Machines with a
   half-plate add-on are common; one `load_step` cannot express "stack steps of 5, plus 2.5 add-on".
5. **Bodyweight/assist**: negative numbers (Alpha), per-type "assisting" flag (Liftosaur), bodyweight
   percentage (Alpha). Sigil has `bodyweight_assisted_reps` as a type.
6. **Per-side vs total** is a per-exercise convention (Alpha) or "per dumbbell" display (Fitbod).
7. **Swaps**: everyone ranks by same muscle plus equipment filter; the best (Fitbod) recalculates the
   load via e1RM, with an explicit "can't match" failure. Alpha avoids transfer: each exercise
   keeps its own history. Nobody documents ranking beyond muscle plus equipment, so our
   `primary_detail` overlap is already ahead.
8. **Allow/disallow lists** override equipment filters (Alpha, MacroFactor).
9. **Notes**: Alpha pins a note so it shows each time; matches our setup note chip.

## 3. Gaps and bugs in Sigil's current code

1. **Progression ignores the user's kit.** `incrementFor`/`lightenLoad`/`loadable`
   (`progression-steps.ts`) use a fixed `SMALLEST_STEP` per equipment. Warm-ups already round with the
   plate kit (`warmup-ramp.ts:100`), progression does not. A barbell suggestion can be unloadable with
   the user's actual plates (home kit with no 1.25 plates, or a bar-less kit). `loadable()` is only a
   format/parse round trip, not a kit snap.
2. **Dumbbell step is 1 kg / 2.5 lb, wrong for most racks.** At 30 kg, 2.5% is 0.75, so the increment
   is `max(1, round(0.75))` = 1 kg and suggests 31 kg dumbbells. Real racks step 2 to 2.5 kg
   (lb: 5) above 10 kg. The planned single `load_step` fixes one exercise at a time but the default is
   still wrong for every new dumbbell exercise.
3. **Easy-set doubling is unsnapped** (`added * 2`): 2 x a manual or default step may not be loadable,
   and ignores any cap. It must go through the same snap/cap as a normal add.
4. **`bodyweight_assisted_reps` gets no progression**: `suggestNext` returns `null` unless the type is
   weighted, `reps_only` or `bodyweight_reps`. Assisted pull-ups never progress (assist should
   decrease). Not in our plan.
5. **Deload and break loads use step rounding, not the kit or cap** (`lightenLoad`); with a stack of
   fixed pins the result may not exist.
6. **Swap query** (`swapCandidatesQuery`, `detail.ts:90`): `equipment <> ?` (already planned to
   drop), no `type` filter (a `weight_reps` exercise can be offered a duration or bodyweight
   alternative), no history signal, no gym signal, ranking only by `primary_detail` overlap then
   `rank`. `LIMIT` is applied before any gym availability sort, so with the planned "available first"
   ordering the limit must apply after ordering, which means ordering in SQL with a join to
   gym equipment or a larger fetch.
7. **No load transfer on swap.** Nothing maps the old exercise's load to the new one; the picker
   returns a bare exercise. The user starts with no suggestion.
8. **`gym_equipment.kind` has a check `IN ('bar','plate')`** (`tables.ts:412`). Dumbbell racks,
   stacks or add-ons need either a new kind (check change, still additive if widened) or a separate
   table.
9. **No per-side/total or unilateral notion** anywhere in shared/api. Dumbbell caps and plate
   counts (pairs) are fine, but a dumbbell exercise's `load` meaning (per hand or total) is
   undocumented in the schema, and a "dumbbell max" gym cap must be defined per hand.
10. **Plan hole: cap vs `incrementFor` order.** Plan says a cap overrides, `load_step` overrides the
    default. It does not say what happens when `cap - load < step` (suggest the cap exactly, even if
    off-grid) or when the cap is below the user's last load (should clamp and say why).

## 4. Recommended amendments

| # | Change | Why | Cost | When |
|---|---|---|---|---|
| 1 | Make `incrementFor`, `lightenLoad`, `loadable` take an optional **load grid** (sorted list of loadable kg, or `{min,max,step}` ranges) and snap to it; derive the default grid for barbell types from the gym's plate kit (`smallestBarStepKg`). | Warm-ups already do this; progression can suggest unloadable weights. All good apps snap to real weights. | M | Now |
| 2 | Store **ranges** `[{min,max,step}]` per (gym, exercise) instead of `max_load` + `load_step`: first range's `min`, last range's `max`, step per range. UI shows the simple two-field form while there is one range; advanced adds ranges. Migrate cleanly: `max_load` = last `max`, `load_step` = one range. | Expresses cap, uneven dumbbell steps and stack jumps in one model (Alpha, MacroFactor); avoids a second schema change. | M | Now (schema), advanced UI later |
| 3 | Fix **default dumbbell step**: use 2.5 kg (5 lb) above 10 kg (5 lb) and 1 kg (2.5 lb) up to it, as a built-in range default; use the same defaults for kettlebells. | Current 1 kg suggestion is wrong for typical racks. | S | Now |
| 4 | Snap the **easy-set double increment** through the grid and cap; if doubling exceeds the cap, take one step. | Bug 3. | S | Now |
| 5 | **Cap rules**: clamp suggestion to cap; if last load is above cap, suggest cap and a "capped" reason; when the add would exceed the cap by less than a step, suggest the cap exactly. Reps continue to the extended ceiling as planned. | Closes plan hole 10; Alpha-style "reps instead of load". | S | Now |
| 6 | When the next step is a large relative jump (over about 10% of load, e.g. 7.5 to 10 kg dumbbell), suggest +1 rep before the jump instead of adding load. | Alpha's documented behaviour; avoids 30% jumps at light stacks. | M | Later |
| 7 | **Swap query**: drop equipment exclusion, filter to the same `type` family (weighted vs bodyweight vs duration), order available-at-gym first then detail overlap then rank, and apply `LIMIT` after ordering. | Bug 6; keeps unloadable or wrong-type suggestions out. | S | Now |
| 8 | **Load seed on swap** (not transfer): from the old exercise's best recent e1RM, estimate the new exercise's start as `e1RM x ratio(equipmentFrom, equipmentTo)` rounded to the grid, labelled "Estimated from X". Ratios are crude constants (barbell 1.0, dumbbell per hand ~0.37 of barbell, machine ~0.9, cable ~0.6) and the new exercise's own history always wins. No estimate if types differ. Show as an editable ghost, never auto-applied. | Fitbod recalculates from e1RM; Alpha keeps histories separate. This takes both: separate history plus a seed only for a first-time exercise. Constants need review. | M | Later |
| 9 | Add `unilateral` / `load_basis` (per hand, per side, total) on the exercise, defaulting from equipment; dumbbell gym cap is per hand. | Fitbod displays per dumbbell; Alpha documents it per exercise; our cap semantics need it. | S | Now (define) |
| 10 | Support **micro-adds** as an optional `add_on_kg` list on the machine setting. | MacroFactor treats them as first class; common on machine stacks and cables. | S | Later |
| 11 | **Assisted bodyweight progression**: for `bodyweight_assisted_reps`, treat progress as lowering assistance by the step and cap at 0. | Currently null. | M | Later |
| 12 | Add per-gym **allow/disallow exercises** (hidden list) alongside equipment tick list. | MacroFactor and Alpha both have it; avoids misclassified equipment. | S | Later |
| 13 | Widen `gym_equipment.kind` check (or new table) for dumbbell range and stack entries when equipment lands; do it as an additive migration with the `gym_id` column. | Check constraint blocks new kinds. | S | Now |
| 14 | Pin the **setup note** as the chip (already planned) and add a warning in the UI copy that the same stack number differs between machines; keep notes free-text. | Matches Alpha; structured seat fields not worth it. | S | Now |

Not recommended: separate per-exercise increments on top of per-gym ones (MacroFactor does per gym only); our per-gym-per-exercise setting is already richer.
