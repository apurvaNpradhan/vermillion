# sync/training

Local-first stores and watches for the training tables. `index.ts` is the public surface of this folder; `store.ts` and `watch.ts` aggregate the feature stores.

- `plans/`: Program, rotation slot, Workout, exercise setting, copy and cover stores. Start at `workout-store.ts`.
- `sessions/`: Session, its content, workout link, equipment and photo stores and watches. Start at `session-store.ts`.
- `sessions/exercise-history.ts`: `loadExerciseHistory`, the one way the database surfaces (the live notification, a Session start) read an exercise's history for the engine.
- root: `tables.ts` (the synced tables), `store-common.ts`, `position.ts` (ordering) and the aggregate `store.ts` / `watch.ts`.

The Session exercise owns its nullable `prescription` JSON. Its existing row ID is the snapshot's
identity and the set IDs bind suggestions to rows through inserts and reordering. The owning device
captures it when it prepares logging targets and the server keeps the first capture. Explicit
re-suggestions name the revision they read so a stale capture or edit cannot replace a newer
one. Entries from older apps have no snapshot until they offer a suggestion in a live Session.
Sets added after capture use their own targets and Previous. A swap to a different library
exercise gets its own capture, and a split keeps the original snapshot with the original entry.

A same-day adjustment is one more revision of that snapshot. When a working, top or back-off set
misses its target (capacity 1.5 reps or effort, or 2 reps, off; at another load, by estimated 1RM)
or beats it by the same, `tickSet` revises the unticked progressing sets of that exercise in the
same write: one step through the gym grid, the caps and the exercise's unit, keeping each set's
first suggested load (`unadjustedWeightKg`) and recording the trigger with what it moved in
`adjustments`, so a set triggers once and adjustments undo one at a time. Undo for the Session
(`undoSessionAdjustment`) takes back the newest and sets `adjustmentUndone`; unticking or correcting
the trigger set (`untickSet`, `updateSet`) takes its own back. `revisePrescription` gives the
unticked sets that went stale (a Session gym that moved, an edited kind or target) and any set added
since a fresh suggestion; ticked sets keep theirs. Every write reads the snapshot with the strict
schema (`readSnapshot`): one this build cannot fully read is never adjusted, revised or written over.
History rows carry what was first suggested (`LoggedSet.suggested`), which the stall check and the
finished Session's suggested-versus-done line read.
