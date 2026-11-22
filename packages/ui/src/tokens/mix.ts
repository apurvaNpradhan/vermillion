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

/** A colour in OKLCH: perceptual lightness 0..1, chroma, hue in degrees. */
export interface Oklch {
  l: number;
  c: number;
  h: number;
}

/** "#rrggbb" to OKLCH. */
export function toOklch(hex: string): Oklch {
  const [r, g, b] = [linear(hex, 1), linear(hex, 3), linear(hex, 5)];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const h = (Math.atan2(B, A) * 180) / Math.PI;
  return { l: L, c: Math.hypot(A, B), h: h < 0 ? h + 360 : h };
}

/** Linear sRGB channels of an OKLCH colour; may fall outside 0..1 when out of gamut. */
function oklchToLinear({ l: L, c, h }: Oklch): [number, number, number] {
  const A = c * Math.cos((h * Math.PI) / 180);
  const B = c * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const inGamut = (channels: number[]) => channels.every((v) => v >= -1e-4 && v <= 1 + 1e-4);

/** OKLCH to "#rrggbb", lowering chroma (never lightness or hue) until the colour fits sRGB. */
export function fromOklch(color: Oklch): string {
  if (color.l <= 0) return "#000000";
  if (color.l >= 1) return "#FFFFFF";
  let channels = oklchToLinear(color);
  if (!inGamut(channels)) {
    let [lo, hi] = [0, color.c];
    for (let i = 0; i < 24; i += 1) {
      const mid = (lo + hi) / 2;
      if (inGamut(oklchToLinear({ ...color, c: mid }))) lo = mid;
      else hi = mid;
    }
    channels = oklchToLinear({ ...color, c: lo });
  }
  const encode = (v: number) => {
    const clamped = Math.min(1, Math.max(0, v));
    const srgb = clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * clamped ** (1 / 2.4) - 0.055;
    return Math.round(srgb * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${channels.map(encode).join("")}`.toUpperCase();
}

/** `hex` with its OKLCH lightness moved by `delta`, keeping hue and chroma. */
export function shiftLightness(hex: string, delta: number): string {
  const color = toOklch(hex);
  return fromOklch({ ...color, l: Math.min(1, Math.max(0, color.l + delta)) });
}

/**
 * `color` with its OKLCH lightness moved in `direction` (-1 darker, 1 lighter) in small steps
 * until it reaches `ratio` against every ground. Hue and chroma are kept, so a tone stays itself
 * instead of greying out the way mixing toward the ink would. Throws when no shade can reach
 * the ratio, so a theme with incompatible seeds fails to build instead of shipping unreadable.
 */
export function readableByLightness(
  color: string,
  grounds: string[],
  ratio: number,
  direction: -1 | 1,
): string {
  for (let step = 0; step <= 1; step += 0.01) {
    const candidate = shiftLightness(color, direction * step);
    if (grounds.every((ground) => contrastRatio(candidate, ground) >= ratio)) return candidate;
  }
  throw new Error(
    `No ${direction < 0 ? "darker" : "lighter"} shade of ${color} reaches ${ratio}:1 on ${grounds.join(", ")}`,
  );
}
