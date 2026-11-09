# 0030. Native component sourcing: HeroUI Native base, copy-in for the rest

Status: accepted (2026-11-08).

## Context

HeroUI Native covers buttons, cards, sheets, toasts and alerts, but not what the account-first screens and the notes list need: one-time-code cells, a skeleton, an empty state, a search field, a segmented control, a labelled field with adornments, a rolling number. Two MIT libraries ship those: PanelUI (1.0 released 2026-11-02; Uniwind and Hugeicons, about 25 peer dependencies) and Reacticx (StyleSheet or NativeWind, Skia for several pieces). Taking either as an npm dependency would import a second icon set, a second styling convention and a long peer list into an app whose tokens, icons ([DESIGN.md](../../DESIGN.md)) and i18n are already decided.

## Decision

- **HeroUI Native stays the base.** Screens import `Button` and `Card` from `platform/ui`, and HeroUI's other parts directly where they fit.
- **PanelUI is not an npm dependency.** A component is copied in (by CLI or from source) into `apps/native/src/platform/ui/`, then restyled to brand tokens (`bg-field`, `border-separator`, role classes only), switched to Phosphor icons, given every user-visible string through props (the screen passes translated text), and headed with a comment naming the source, version, MIT licence and what changed. Logic that can be tested without React Native moves to a pure sibling file (`otp-code.ts`, `segmented-index.ts`, `number-flow-format.ts`).
- **Reacticx is copy-in only, and only for Reanimated-only pieces.** Same rules. Nothing that needs Skia: no Skia in the app.
- **Port by need.** A component is copied when a screen uses it in the same change; knip flags one that nothing uses.

## Ported

| Component                                 | Source                            | Used by                           |
| ----------------------------------------- | --------------------------------- | --------------------------------- |
| `OtpInput`                                | PanelUI                           | Code screen, change-email         |
| `Field`                                   | PanelUI (`Field`, `InputGroup`)   | Email, onboarding, profile, forms |
| `SearchBar`                               | PanelUI                           | Notes                             |
| `Skeleton`, `SkeletonRow`, `SkeletonList` | PanelUI                           | Notes while loading               |
| `EmptyState`                              | PanelUI                           | Notes (empty, no results)         |
| `SegmentedControl`                        | Reacticx                          | Settings theme                    |
| `NumberFlow`                              | Reacticx                          | `StatTile`                        |
| `StatTile`                                | Ours (DESIGN.md), on `NumberFlow` | Home                              |

`SwipeRow` took one idea from PanelUI's swipeable row, the velocity look-ahead (`shouldSettleOpen`, which settles by where the drag is heading, not only where it is). Rejected: its spring settle (motion tokens say no bounce on repeated actions), bidirectional swipe, the imperative ref API and the solid action tiles (ours are rose on a faint tint).

## Deferred

`Select`, `DatePicker`, `animated-theme-toggle`, `scrollable-search` and `expandable-view` have no screen yet. Reacticx's settings and welcome blocks are reference only: the welcome screen already follows its layout and the settings screen is `ListSection` rows.

## Consequences

- Copied files are ours to maintain; an upstream fix is a manual diff. The header comment says which version to compare against.
- Each file carries its licence notice, so the MIT terms are kept without a dependency to audit.
- New components land with a screen that uses them, or not at all.
