# sync/training

Local-first stores and watches for the training tables. `index.ts` is the public surface of this folder; `store.ts` and `watch.ts` aggregate the feature stores.

- `plans/`: Program, rotation slot, Workout, exercise setting, copy and cover stores. Start at `workout-store.ts`.
- `sessions/`: Session, its content, workout link, equipment and photo stores and watches. Start at `session-store.ts`.
- root: `tables.ts` (the synced tables), `store-common.ts`, `position.ts` (ordering) and the aggregate `store.ts` / `watch.ts`.

The Session exercise owns its nullable `prescription` JSON. Its existing row ID is the snapshot's
identity and the set IDs bind suggestions to rows through inserts and reordering. The owning device
captures it when it prepares logging targets and the server keeps the first capture. Explicit
re-suggestions name the revision they read so a stale capture or edit cannot replace a newer
one. Entries from older apps have no snapshot until they offer a suggestion in a live Session.
Sets added after capture use their own targets and Previous. A swap to a different library
exercise gets its own capture, and a split keeps the original snapshot with the original entry.
