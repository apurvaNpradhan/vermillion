# 0047. Palettes derived from a few seed colours

Status: amended by [0048](0048-theme-engine-and-nord.md), 2026-11-18; superseded by
[0059](0059-amoled-neutral-modes-and-accent-split.md), 2026-11-24. Accepted 2026-11-17. Supersedes [0043](0043-graphite-base-and-accents.md). The
colour-only layout rule, device-local storage and contrast requirements of
[0039](0039-hand-tuned-native-themes.md) remain.

The native picker and five presets were subsequently retired for palette exploration. The seed
derivation remains in use. See the [native themes guide](../guides/native-themes.md) for current
behavior.

## Context

0043 left one cool grey base with a saturated accent on top. In use it read as cold and
off-brand: the mood of an interface comes from its surfaces, and an accent cannot change those.
The references the owner collected are all tinted, low-saturation neutral ramps (paper, sage,
slate, charcoal) with at most one colour. The palettes before 0043 had the right idea but each
was fully hand-tuned, which is what made them expensive and unfinished.

## Decision

- A palette is five seed colours per scheme (light and dark): canvas, surface, ink, accent and
  the ink on the accent. `themes/palettes.ts` derives every other role by mixing toward the ink,
  and moves any text, mark or fill until it meets its contrast rule. True black is derived from
  the dark seeds.
- Five palettes ship: **Cinnabar** (paper and coral; the default, and the brand), **Sage**,
  **Harbor**, **Alpine** and **Ashes**. There is no separate accent picker.
- Status, set-kind and macro colours are one muted set per scheme, shared by every palette and
  nudged per palette only as far as contrast requires. Plate colours never change.
- `device.theme` stores `{ palette, appearance, black }`. Earlier formats keep their appearance
  and true-black choice and start on Cinnabar.
- Email and the site use Cinnabar.

## Consequences

- Adding a palette is ten colours, one translation and its three Metro variant names; the rule
  tests cover it with no exemptions.
- An accent seed is a wish, not a guarantee: where it cannot carry its ink at 4.5:1 the fill is
  moved (Cinnabar's light button is a deeper red than the coral seed so white text stays
  readable).
- People who had picked an accent return to Cinnabar with their light, dark and black choices
  kept.
