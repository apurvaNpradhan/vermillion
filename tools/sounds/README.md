# Sound generator

`generate.py` synthesises Sigil's soft cue family (C major) in two timbres:

- **marimba**: wooden bar partials plus a soft mallet thump. This is the **shipped** set,
  written to `apps/native/assets/sounds/` with the same filenames as before.
- **bell**: additive, inharmonic partials with a short FM shimmer. Kept for comparison only.

Both sets are also written to `tools/sounds/audition/{bell,marimba}/`.

```sh
python3 tools/sounds/generate.py   # needs python3, numpy, ffmpeg (libmp3lame)
```

Output is deterministic. To audition, open `tools/sounds/audition/index.html` in a browser (play each
cue in both timbres, or the tick → step → finish phrase). To ship bell instead, change
`export(sets["marimba"], ACTIVE_DIR)` in `main()` to `"bell"` and re-run, then rebuild the app so the notification sound is re-bundled.

Budgets: tick ≤150 ms, step ≤250 ms, finish and record ≤1.2 s, rest end 2 s. Peaks stay under
-2 dBFS and each cue is RMS-normalised (rest end sits louder).
