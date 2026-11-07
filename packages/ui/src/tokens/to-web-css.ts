import { brandTokens, colorTokenNames, type ColorTokens } from "./brand";

const block = (selector: string, colors: ColorTokens, extra: string[] = []) =>
  [
    `${selector} {`,
    ...extra,
    ...colorTokenNames.map((name) => `  --${name}: ${colors[name]};`),
    "}",
  ].join("\n");

/** Web mapping: every brand token becomes `--name`, exposed to Tailwind as `--color-name`. */
export function toWebCss(tokens: typeof brandTokens = brandTokens): string {
  const aliases = colorTokenNames.map((name) => `  --color-${name}: var(--${name});`);
  return [
    "/* Generated from src/tokens/brand.ts by `pnpm --filter @workspace/ui tokens`. Do not edit. */",
    block(":root", tokens.colors.light, [`  --radius: ${tokens.radius};`]),
    block(".dark", tokens.colors.dark),
    [
      "@theme inline {",
      ...aliases,
      `  --font-sans: ${tokens.fonts.sans};`,
      `  --font-mono: ${tokens.fonts.mono};`,
      "}",
    ].join("\n"),
    "",
  ].join("\n\n");
}
