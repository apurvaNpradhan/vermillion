# session

Public surface: `index.ts`. Each folder is one feature; hooks, components, pure logic and tests live together.

- `screen/`: the live Session screen and its header, photos and ownership banner. Start at `session-screen.tsx`.
- `logging/`: optimistic set entry, ghosts, copy and keypad logic. Start at `use-session-logging.tsx`.
- `sets/`: set rows, cells, grid, keypad, effort and note sheets. Start at `set-grid.tsx`.
- `lifecycle/`: start, resume, forgotten sessions and save-time choices. Start at `use-start-session.tsx`.
- `rest/`: rest rules, schedule, nudges and the rest bar. Start at `rest-rules.ts`.
- `timer/`: the timer screen, clock and duration timer. Start at `timer-screen.tsx`.
- `notifications/`: rest notifications and the workout live notification (the permission and the reconciler live in `platform/notifications`). Start at `workout-live-state.ts`.
- `plates/`: the plate calculator and equipment management. Start at `plate-calculator-sheet.tsx`.
- `finish/`: finish flow, summary screen, records and the routine update sheet. Start at `use-finish-flow.tsx`.
- `history/`: history list, calendar, detail and logging a past session. Start at `history-screen.tsx`.
- `settings/`: session settings sheet and sound cues. Start at `use-session-settings.tsx`.
- `share/`: the Session share cards and composer. Start at `session-share-screen.tsx`.
- `shared/`: small helpers two or more features use (sheet shell, install id, clock hook).
