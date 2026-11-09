# 0013. One brand-token file for web and native

Status: accepted (2026-11-06).

## Context

Web uses coss ui (Base UI) components; native uses HeroUI Native with Uniwind. Their token names differ.

## Decision

`packages/ui/src/tokens/brand.ts` defines the colors, radius and fonts once, under coss ui / shadcn semantic names. Small mapping files generate the web CSS variables and the native (Uniwind and HeroUI) CSS. See [DESIGN.md](../../DESIGN.md).

## Consequences

- Rebranding a fork is editing one file and running the token script.
- Some web-only tokens (`info`, `chart-*`, `sidebar-*`) have no native counterpart.
- Amended 2026-11-09 ([0033](0033-mobile-first-api-host.md)): the web adapter, its generated CSS and the coss components are gone. `packages/ui` is tokens only; the native adapter and the email templates read `brand.ts`.
