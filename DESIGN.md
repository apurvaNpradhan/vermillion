# Design

Brand tokens for vermillion. The single source is `packages/ui/src/tokens/brand.ts`; this page documents it. Rebranding a fork means editing that file, then:

```sh
pnpm --filter @workspace/ui tokens
```

which regenerates `packages/ui/src/styles/tokens.css` (web) and `native-tokens.css` (native). Never edit the generated files, and reference tokens, not raw hex values, in components.

Names are coss ui / shadcn semantic names. Light and dark are two equal themes built from the same names. Theme is chosen per device (cookie on web, device storage on native).

## Typography and shape

| Token  | Value                                                     |
| ------ | --------------------------------------------------------- |
| Sans   | `Inter Variable` (`@fontsource-variable/inter`)           |
| Mono   | `Geist Mono Variable` (`@fontsource-variable/geist-mono`) |
| Radius | `0.5rem`                                                  |

## Color tokens

Web uses the names 1:1: each is a CSS variable (`--primary`) plus a Tailwind alias (`--color-primary`, so `bg-primary`). Native maps them to HeroUI Native's names through `nativeTokenSources` in `to-native-css.ts`; a dash means web only.

### Surfaces and text

| Token                  | Light     | Dark      | HeroUI Native                                                  |
| ---------------------- | --------- | --------- | -------------------------------------------------------------- |
| `background`           | `#ffffff` | `#0a0a0a` | `background`                                                   |
| `foreground`           | `#111111` | `#ededed` | `foreground`, `field-foreground`, `segment-foreground`, `link` |
| `card`                 | `#ffffff` | `#0f0f0f` | `surface`                                                      |
| `card-foreground`      | `#111111` | `#ededed` | `surface-foreground`                                           |
| `popover`              | `#ffffff` | `#141414` | `overlay`                                                      |
| `popover-foreground`   | `#111111` | `#ededed` | `overlay-foreground`                                           |
| `muted`                | `#fafafa` | `#141414` | -                                                              |
| `muted-foreground`     | `#666666` | `#9a9a9a` | `muted`, `field-placeholder`                                   |
| `secondary`            | `#fafafa` | `#141414` | `surface-secondary`                                            |
| `secondary-foreground` | `#0a0a0a` | `#ededed` | `surface-secondary-foreground`, `default-foreground`           |
| `accent`               | `#f5f5f5` | `#202020` | `surface-tertiary`                                             |
| `accent-foreground`    | `#0a0a0a` | `#ededed` | `surface-tertiary-foreground`                                  |

### Actions and status

| Token                    | Light     | Dark      | HeroUI Native                                                                        |
| ------------------------ | --------- | --------- | ------------------------------------------------------------------------------------ |
| `primary`                | `#0a0a0a` | `#ffffff` | `accent`                                                                             |
| `primary-foreground`     | `#ffffff` | `#0a0a0a` | `accent-foreground`, `success-foreground`, `warning-foreground`, `danger-foreground` |
| `destructive`            | `#b4261a` | `#e0726a` | `danger`                                                                             |
| `destructive-foreground` | `#8f1d14` | `#ec9a94` | -                                                                                    |
| `success`                | `#2f7d52` | `#4fb083` | `success`                                                                            |
| `success-foreground`     | `#25643f` | `#7cc9a3` | -                                                                                    |
| `warning`                | `#b4690e` | `#d9883a` | `warning`                                                                            |
| `warning-foreground`     | `#8a500a` | `#e8a860` | -                                                                                    |
| `info`                   | `#3b6ea5` | `#6b9bd1` | -                                                                                    |
| `info-foreground`        | `#2c5282` | `#8fb4de` | -                                                                                    |

### Lines and controls

| Token           | Light     | Dark      | HeroUI Native                 |
| --------------- | --------- | --------- | ----------------------------- |
| `border`        | `#eaeaea` | `#2a2a2a` | `border`, `separator`         |
| `input`         | `#d4d4d4` | `#333333` | `field-border`                |
| `ring`          | `#888888` | `#777777` | `focus`                       |
| `control`       | `#fafafa` | `#1c1c1c` | `default`, `field-background` |
| `control-hover` | `#f0f0f0` | `#262626` | `segment`                     |

### Charts

| Token     | Light     | Dark      | HeroUI Native |
| --------- | --------- | --------- | ------------- |
| `chart-1` | `#3b6ea5` | `#6b9bd1` | -             |
| `chart-2` | `#2f7d52` | `#4fb083` | -             |
| `chart-3` | `#b4690e` | `#d9883a` | -             |
| `chart-4` | `#7a5aa6` | `#a38acb` | -             |
| `chart-5` | `#666666` | `#9a9a9a` | -             |

### Sidebar

| Token                        | Light     | Dark      | HeroUI Native |
| ---------------------------- | --------- | --------- | ------------- |
| `sidebar`                    | `#ffffff` | `#0a0a0a` | -             |
| `sidebar-foreground`         | `#666666` | `#9a9a9a` | -             |
| `sidebar-primary`            | `#0a0a0a` | `#ffffff` | -             |
| `sidebar-primary-foreground` | `#ffffff` | `#0a0a0a` | -             |
| `sidebar-accent`             | `#f5f5f5` | `#141414` | -             |
| `sidebar-accent-foreground`  | `#0a0a0a` | `#ededed` | -             |
| `sidebar-border`             | `#eaeaea` | `#1f1f1f` | -             |
| `sidebar-ring`               | `#888888` | `#777777` | -             |

## Platform differences

- HeroUI `muted` is a text color (our `muted-foreground`), not a background.
- HeroUI status `*-foreground` is the text on the saturated color, so it takes our `primary-foreground`; our status `*-foreground` tokens are darker text tones for tinted backgrounds.
- `info`, `chart-*` and `sidebar-*` have no HeroUI counterpart.
- Several native roles reuse one brand token (`default` and `field-background` both use `control`; `border` and `separator` both use `border`).

## Component names

Web components live in `packages/ui/src/components` and are installed from the coss ui registry (see `.agents/ui.md`); native screens use HeroUI Native components styled through Uniwind classes. Both read the tokens above, so a component never needs a color of its own.
