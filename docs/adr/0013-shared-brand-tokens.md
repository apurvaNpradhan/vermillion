# 0013. One brand-token file for web and native

Status: accepted (2026-11-06).

## Context

Web uses coss ui (Base UI) components; native uses HeroUI Native with Uniwind. Their token names differ.

## Decision

`packages/ui/src/tokens/brand.ts` defines the colors, radius and fonts once, under coss ui / shadcn semantic names. Small mapping files generate the web CSS variables and the native (Uniwind and HeroUI) CSS. See [DESIGN.md](../../DESIGN.md).

## Consequences

- Rebranding a fork is editing one file and running the token script.
- Some web-only tokens (`info`, `chart-*`, `sidebar-*`) have no native counterpart.
