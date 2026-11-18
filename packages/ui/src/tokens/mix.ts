/** "#rrggbb" blended: `amount` of `top` over `base`. */
export function mixHex(base: string, top: string, amount: number): string {
  const channel = (hex: string, at: number) => Number.parseInt(hex.slice(at, at + 2), 16);
  const part = (at: number) =>
    Math.round(channel(base, at) * (1 - amount) + channel(top, at) * amount)
      .toString(16)
      .padStart(2, "0");
  return `#${part(1)}${part(3)}${part(5)}`.toUpperCase();
}

const linear = (hex: string, at: number) => {
  const v = Number.parseInt(hex.slice(at, at + 2), 16) / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

/** WCAG relative luminance of a "#rrggbb" colour. */
function luminance(hex: string): number {
  return 0.2126 * linear(hex, 1) + 0.7152 * linear(hex, 3) + 0.0722 * linear(hex, 5);
}

/** WCAG contrast ratio of two "#rrggbb" colours. */
export function contrastRatio(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** OKLab lightness of a "#rrggbb" colour. */
export function lightness(hex: string): number {
  const [r, g, b] = [linear(hex, 1), linear(hex, 3), linear(hex, 5)];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
}

/**
 * `color`, moved toward `toward` in small steps until it reaches `ratio` against every ground.
 * A colour that already passes is returned unchanged.
 */
export function readable(color: string, grounds: string[], toward: string, ratio: number): string {
  for (let amount = 0; amount <= 1; amount += 0.02) {
    const candidate = mixHex(color, toward, amount);
    if (grounds.every((ground) => contrastRatio(candidate, ground) >= ratio)) return candidate;
  }
  return toward;
}

/** `from`, moved toward `toward` until its lightness differs from `from` by at least `step`. */
export function stepped(from: string, toward: string, step: number): string {
  for (let amount = 0.01; amount <= 1; amount += 0.01) {
    const candidate = mixHex(from, toward, amount);
    if (Math.abs(lightness(candidate) - lightness(from)) >= step) return candidate;
  }
  return toward;
}
