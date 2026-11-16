# 0043. One neutral base with a separate accent

Status: accepted, 2026-11-16. Supersedes the palette collection in
[0039](0039-hand-tuned-native-themes.md). Its colour-only layout rule, device-local storage and
contrast requirements remain.

## Context

Eight named palettes each retuned surfaces, text and accents together. They read as decoration,
several were unfinished placeholders with test exemptions, and each new one multiplied the
contrast work. The app wants to look calm and premium: neutral surfaces, with colour kept for one
accent, data and status.

## Decision

- One neutral base, Graphite, in three modes: light, dark, and dark on a true-black canvas for
  OLED screens.
- A separate accent chosen by the user: Mono (the brightest neutral), Vermilion, Indigo, Orchid
  or Sky. An accent is one fill and its ink, for light and for dark; true black reuses dark.
- The accent supplies `action`, `identity`, `chart`, `focus-ring` and their soft, hover and
  pressed tones, which are derived from the fill and the base. Every other role is the base's.
- Appearance (System, Light, Dark), the true-black switch and the accent live in one sheet and in
  `device.theme` as `{ accent, appearance, black }`. Earlier stored formats keep their appearance
  and start on Mono.
- All earlier palettes and their inspiration credits are removed.

## Consequences

- Adding an accent is one entry in `accents.ts`, one translation and its three Metro variant
  names; the rule tests cover it without exemptions.
- Status, set-kind, macro and plate colours no longer shift with the user's choice.
- People who had picked a retired palette return to Mono with their light/dark choice kept.
