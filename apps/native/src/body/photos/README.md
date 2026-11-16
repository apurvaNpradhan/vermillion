# body/photos

Progress photos. Screens and helpers two folders use stay at the top; each folder is one feature.

- `photos-screen.tsx`: the Photos screen; start here. `use-progress-photos.ts` reads the rows, `local-date.ts` and `pose-labels.ts` are shared.
- `capture/`: taking or picking photos in a check-in, pending photos and saving. Start at `use-photo-actions.ts`.
- `compare/`: comparing two dates side by side, with its date picker and stats. Start at `compare-screen.tsx`.
- `privacy/`: Hide photos, the blurred tile and reveal. Start at `use-hide-photos.ts`.
