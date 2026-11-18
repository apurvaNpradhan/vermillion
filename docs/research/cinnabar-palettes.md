# Palette directions for Cinnabar

Start with **Ink, Juniper, Pumice and Ultramarine** in the
[palette gallery](../design/palette-gallery.html). They answer different questions about how
much of the interface should carry colour.

| Candidate   | What it tests                                                                  |
| ----------- | ------------------------------------------------------------------------------ |
| Ink         | Whether spacing and type alone give workout rows and actions enough hierarchy. |
| Juniper     | Whether tinted backgrounds give Cinnabar a stronger identity in both modes.    |
| Pumice      | Whether a warmer, quieter palette stays legible during a workout.              |
| Ultramarine | Whether nearly neutral surfaces and a single strong accent are enough.         |

The gallery also has Porcelain, Oxblood, Lapis, Wisteria, Olive, Sienna, Lagoon, Mulberry,
Flint, Spruce, Ember and Acid. Compare Ember with Oxblood for two ways to keep a red accent.
Try Flint or Acid to see how a brighter action feels against a dark workout screen.

## What to borrow

- **T3 Code** offers themes alongside the light or dark setting. Its environment themes can derive
  a palette from a canvas and accent. For Cinnabar, pick the surface tint together with the accent
  so changing the palette affects the overall screen. [T3 Code appearance docs](https://github.com/pingdotgg/t3code/blob/main/docs/user/appearance.md#environment-themes)
- **ChatGPT** applies its accent to selected elements such as message bubbles, buttons and
  highlights. Try the same restraint in Cinnabar. Let the primary action, current set and chart
  share a colour while completed sets keep their green check and errors keep their own colour.
  [OpenAI Help Center](https://help.openai.com/en/articles/11958281-updating-your-visual-experience-on-chatgpt)
- **Radix Colors** assigns distinct steps to backgrounds, controls, selected states, solid fills
  and text. Check that canvas, card and control still read as separate layers when the accent is
  out of view. [Radix color roles](https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale)
- **Apple's guidance** calls for checking colours across appearances and using additional cues
  to convey information. Try the same set log and chart on a phone under bright and dim light.
  Check loads, reps and timer digits at a glance. [Apple HIG Color](https://developer.apple.com/design/human-interface-guidelines/color)

## How the demos were checked

All 16 candidates use Cinnabar's role derivation with separate light and dark seeds. True Black
uses the dark seeds on a pure black canvas, with adjusted surfaces. Each candidate uses the same
workout data, set states and chart.

The demo pairs were checked in all three modes, including Cinnabar's 7:1 target for primary text,
WCAG's 4.5:1 threshold for normal text and button labels, and 3:1 for meaningful graphics. Open
**Hex values and contrast** under either mockup to inspect the resulting roles. These checks
cover the HTML previews. Candidates still need a device review before shipping.
[Native themes guide](../guides/native-themes.md),
[WCAG 2.2](https://www.w3.org/TR/WCAG22/#distinguishable)

## Candidate seeds

Each cell lists canvas, surface, ink, accent, and ink on the accent, in that order.

| Candidate   | Light                                     | Dark                                      |
| ----------- | ----------------------------------------- | ----------------------------------------- |
| Ink         | `#F2F2F2 #FFFFFF #181818 #292929 #FFFFFF` | `#171717 #232323 #F4F4F4 #DADADA #171717` |
| Juniper     | `#EAF2EE #F9FCFA #142721 #20604E #FFFFFF` | `#101E1A #172B24 #E6F4EC #80D7B0 #10231B` |
| Porcelain   | `#EFF2F6 #FDFEFF #171F2B #264FC6 #FFFFFF` | `#141921 #1F2733 #F1F5FD #9DB7FF #141D34` |
| Pumice      | `#EFEBE4 #FCFAF7 #2A231C #76502B #FFFFFF` | `#1E1A16 #2B251E #F5EDE1 #D9AE78 #271C0F` |
| Oxblood     | `#F4EEEF #FFFCFD #2E1820 #87273E #FFFFFF` | `#21141A #301C25 #F9ECF0 #F39AB0 #361221` |
| Lapis       | `#E8F0FA #F8FBFF #172A46 #164E9E #FFFFFF` | `#101A2C #192840 #E9F2FF #72B5FF #0C2341` |
| Wisteria    | `#F1EEF8 #FCFAFF #271E38 #6743A5 #FFFFFF` | `#1B1726 #282137 #F5EDFF #C5A6FF #241439` |
| Olive       | `#EFEEE0 #FAFAF2 #292C1B #536420 #FFFFFF` | `#191C12 #252A19 #F4F3DE #C5DF6C #202809` |
| Ultramarine | `#F0F0F0 #FFFFFF #1F2022 #3B36BE #FFFFFF` | `#141414 #212121 #F3F3F3 #A39BFF #20164A` |
| Sienna      | `#F6EDE5 #FFFBF7 #39251D #9A421E #FFFFFF` | `#231811 #31231A #F8ECE1 #F6AB79 #381904` |
| Lagoon      | `#E7F2F2 #F6FCFC #172D31 #12636B #FFFFFF` | `#101D22 #172B33 #E1F5F6 #73DEE3 #103035` |
| Mulberry    | `#F3EAF0 #FFF9FD #321D2D #8D286C #FFFFFF` | `#211420 #301D2C #F8E9F3 #EA94D4 #35112C` |
| Flint       | `#EEF1F4 #FCFCFD #20272C #6A5005 #FFFFFF` | `#15191D #21272D #EDF2F6 #F0CB61 #2E2205` |
| Spruce      | `#EBF2E8 #F9FCF7 #1C2E21 #366342 #FFFFFF` | `#151D17 #202D23 #EDF5EA #AAD0A3 #172818` |
| Ember       | `#F0EAE3 #FDF9F4 #2A2421 #A13325 #FFFFFF` | `#1C1715 #2A221E #F7EDE7 #FF9A83 #361710` |
| Acid        | `#EEF1E6 #FAFCF6 #20261A #455E0B #FFFFFF` | `#171A16 #232821 #F4F6EC #D2F85F #212900` |
