# training

Public surface: `index.ts`. Each folder is one feature; hooks, components, pure logic and tests live together.

- `home/`: the Home tab: the swipeable week strip, the next-workout hero, This week and the contextual cards (Lighter week, a stalled lift, last session's records). Start at `home-screen.tsx`.
- `train/`: the Train tab: Resume, the active Run hero with its cycle strip, the Program cover grid and the standalone Workouts list. Start at `train-screen.tsx`.
- `muscles/`: this week's sets against each muscle's target with the four-week average, the eight-week chart and goal sheet, the heat map body. Reached from History. Start at `muscles-screen.tsx`.
- `programs/`: Program library, run, details, cover and meta. Start at `program-screen.tsx`.
- `rotation/`: rotation slots, their rows and adding workouts to a Program. Start at `rotation.ts`.
- `workouts/`: Workout preview, editor, exercise rows, notes and muscle coverage. Start at `workout-editor.tsx`.
- `sets/`: planned-set tables, rows, tones and set-type editing. Start at `set-table.tsx`.
- `targets/`: effort, reps and rest target controls and their formatting. Start at `effort.ts`.
- `reorder/`: drag-to-reorder maths and list. Start at `reorder.ts`.
- `share/`: Workout and Program share cards. Start at `plan-share-screen.tsx`.
- `shared/`: writes, coalescing, sheet frame and preference rows used by several features. Start at `use-training-write.ts`.
