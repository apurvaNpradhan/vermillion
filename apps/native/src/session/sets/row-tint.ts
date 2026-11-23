/** A completed set tints its whole row with the accent at this opacity. */
export const DONE_TINT_ALPHA = 0.15;

/**
 * `color` ("#rrggbb") at `alpha` as "#rrggbbaa", so a transition can fade the tint in from the
 * same colour at zero opacity. Anything that is not a six-digit hex colour comes back unchanged.
 */
export function withAlpha(color: string | undefined, alpha: number): string | undefined {
  if (color === undefined || !/^#[0-9a-fA-F]{6}$/.test(color)) return color;
  const channel = Math.round(Math.min(1, Math.max(0, alpha)) * 255);
  return `${color}${channel.toString(16).padStart(2, "0")}`;
}
