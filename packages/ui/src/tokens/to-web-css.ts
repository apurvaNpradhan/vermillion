import { brandTokens, roleNames, type RoleTokens } from "./brand";

/**
 * The site's tokens (`apps/web`): the Cinnabar palette (paper and coral),
 * light by default and dark under `prefers-color-scheme: dark`. Every role becomes `--<role>` and
 * a Tailwind color (`bg-canvas`, `text-text-muted`, `bg-action`).
 */
function block(selector: string, roles: RoleTokens): string {
  return [
    `  ${selector} {`,
    ...roleNames.map((name) => `    --${name}: ${roles[name].toLowerCase()};`),
    "  }",
  ].join("\n");
}

export function toWebCss(): string {
  const { light, dark } = brandTokens.colors;
  return (
    [
      "/* Generated from src/tokens/brand.ts by `pnpm --filter @workspace/ui tokens`. Do not edit. */",
      [
        "@layer theme {",
        block(":root", light),
        "  @media (prefers-color-scheme: dark) {",
        block(":root", dark).replace(/^/gm, "  "),
        "  }",
        "}",
      ].join("\n"),
      [
        "@theme inline {",
        ...roleNames.map((name) => `  --color-${name}: var(--${name});`),
        "}",
      ].join("\n"),
      "",
    ]
      .join("\n\n")
      .trimEnd() + "\n"
  );
}
