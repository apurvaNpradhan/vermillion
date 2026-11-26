# Entry guards

Decided 2026-11-27 by the orchestrating agent at the owner's request ("warn when a user adds a big
weight like 1000 kg by mistake … and think of similar small quality-of-life features"; the owner
asked for the agent's decisions). Voice follows "Sigil's own take" in
[gyms-phases-train-round.md](gyms-phases-train-round.md): plain, factual, no alarm.

**Rule: ask once, never block.** A guard is one quiet confirm. The user can always keep what they
typed. Confirmed values are real data and count for Records and progression.

## 1. Check this number

A set or weigh-in that is far outside what this user has done is confirmed before it is saved.

**When it runs**

- Live Session: when a set is ticked (not while typing). A set already kept once is not asked
  again in that Session.
- Editing a finished or backfilled Session: once when you leave a changed cell. Its value is
  already autosaved. The comparison excludes that Session's sets.
- Body weight: when a weigh-in is saved.
- Never for values the app itself filled (Ghost values, the live notification's Done, copy and
  fill actions, imports).

**What counts as implausible** — one pure function in `packages/shared` (training/logging), kg and
lb aware, per side/hand/total following the exercise's load basis:

- Load above the exercise's reference by both ×1.5 and +20 kg (+45 lb). The reference is the
  heaviest completed working load for the exercise in history, or today's suggestion when higher.
- No history yet: load above an equipment ceiling — barbell, machine, cable, Smith 300 kg; dumbbell
  and kettlebell 80 kg per hand; added load on weighted bodyweight 100 kg; assisted 150 kg.
- Load close to 2.2× (or 1/2.2) of the reference, within 5%: the likely kg/lb slip, worded as such.
  For added bodyweight load, the upward slip also needs the +20 kg (+45 lb) gap. For assisted
  bodyweight, load checks use the 150 kg assistance ceiling because more assistance makes the
  exercise easier.
- Reps above 50 on a weighted exercise whose history never passed 25, or above both 3× the best and 30.
- Swapped fields (needs a reference): a whole load of 1–30, reps at least 3× that load and at
  least half the reference, and the load at most a third of the reference. Both fields must be
  manually entered and the reps must exceed the exercise's previous best. The swapped values
  are checked against the hard cap again.
- Warm-ups and drop sets skip downward unit slips, swaps and the relative rep check. A lighter
  load within 5% of the set's suggestion also skips the downward slip.
- Weigh-in more than 7% and 3 kg (7 lb) from the trend weight on the chosen date, or outside
  25–350 kg within the existing valid range. An edited reading is excluded from its own trend.
- Lower than usual is never flagged (deloads and light days are normal), except the 1/2.2 unit
  slip above, and only when the reference is at least 40 kg (90 lb).

**The dialog**

- Title "Check this set" (weigh-in: "Check this weigh-in").
- Body states the fact: "Your heaviest set for Bench Press was 100 kg. Log 1000 kg?" /
  "You entered 220 kg. Did you mean pounds?" / "Looks like the reps and weight are swapped."
- Actions: **Change** (back to the field, value selected), **Keep 1000 kg**, and **Swap** when the
  swapped rule fired.

## 2. Start it again?

Starting a Workout that already has a finished Session today (local day) asks once: "You did Upper
A today. Start it again?" — Start again / Cancel. Starting from the Train strip, Home or the
Workout page all go through the same check. Resume of an open Session is unaffected.

## 3. Already in this workout

Not built: the exercise picker already greys out exercises in the open Session or the Workout being
edited ("Already in"), which is stricter than asking.

### Original intent

Adding an exercise that is already in the open Session (or the Workout being edited) asks: "Bench
Press is already in this workout. Add it again?" — Add again / Cancel. Swaps are unaffected.

## Testing

Seam 1, pure functions in `packages/shared` with vitest: every rule above with kg and lb cases,
per-hand dumbbells, weighted and assisted bodyweight, no-history ceilings, the 2.2× slip, swapped
fields, weigh-in trend, and that lower loads never flag. The native dialogs are checked on the
phone; no component render tests.
