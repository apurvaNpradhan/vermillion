# sync/training

Local-first stores and watches for the training tables. `index.ts` is the public surface of this folder; `store.ts` and `watch.ts` aggregate the feature stores.

- `plans/`: Program, rotation slot, Workout, exercise setting, copy and cover stores. Start at `workout-store.ts`.
- `sessions/`: Session, its content, workout link, equipment and photo stores and watches. Start at `session-store.ts`.
- root: `tables.ts` (the synced tables), `store-common.ts`, `position.ts` (ordering) and the aggregate `store.ts` / `watch.ts`.
