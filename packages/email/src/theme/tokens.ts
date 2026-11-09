import { brandTokens } from "@workspace/ui/tokens/brand";

const { light, dark } = brandTokens.colors;

/**
 * Email theme, derived from the shared brand tokens (DESIGN.md). Light is the base; clients that
 * honour `prefers-color-scheme` get the dark roles from `themeCss`. Email clients know neither CSS
 * variables nor our font, so every value here is a literal taken from `brand.ts`.
 */
export const colors = {
  canvas: light.canvas,
  surface: light.surface,
  control: light["surface-control"],
  hairline: light.hairline,
  textPrimary: light["text-primary"],
  textSecondary: light["text-secondary"],
  textMuted: light["text-muted"],
  action: light.action,
  onAction: light["on-action"],
} as const;

export const darkColors = {
  canvas: dark.canvas,
  surface: dark.surface,
  control: dark["surface-control"],
  hairline: dark.hairline,
  textPrimary: dark["text-primary"],
  textSecondary: dark["text-secondary"],
  textMuted: dark["text-muted"],
  action: dark.action,
  onAction: dark["on-action"],
} as const;

/** Inter where installed, then the platform UI font. */
export const fontFamily = `${brandTokens.fonts.sans}, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial`;
export const monoFamily = brandTokens.fonts.mono;

/** Card 16, code box and button 12 (DESIGN.md radius scale). */
export const radius = { card: 16, control: 12 } as const;

export const type = brandTokens.type;

export function px(value: number) {
  return `${value}px`;
}
