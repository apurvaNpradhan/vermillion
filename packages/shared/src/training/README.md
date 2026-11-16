# shared/training

Pure, runtime-agnostic training logic. `index.ts` re-exports every name; import from `@workspace/shared`.

- `vocabulary/`: the training enums, formatting, labels and input parsing. Start at `vocabulary.ts`.
- `plans/`: planned sets, supersets, rotation cycle, week and the session-versus-workout diff. Start at `planned-sets.ts`.
- `logging/`: logged sets, session inputs, ghosts, previous values and tick values. Start at `logged-set.ts`.
- `plates/`: the gym kit and plate maths. Start at `plates.ts`.
- `volume/`: set and session volume, estimated 1RM, muscle distribution, weekly muscle volume and goals. Start at `volume.ts`.
- `progress/`: records, progression v2, stalled lifts, Lighter weeks and progress charts. Start at `progression.ts`.
