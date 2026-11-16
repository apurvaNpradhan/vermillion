/** "#rrggbb" blended: `amount` of `top` over `base`. */
export function mixHex(base: string, top: string, amount: number): string {
  const channel = (hex: string, at: number) => Number.parseInt(hex.slice(at, at + 2), 16);
  const part = (at: number) =>
    Math.round(channel(base, at) * (1 - amount) + channel(top, at) * amount)
      .toString(16)
      .padStart(2, "0");
  return `#${part(1)}${part(3)}${part(5)}`;
}
