// A relative path, not `@workspace/ui/...`: vite.config.ts is loaded by Node, which would not
// resolve the palette's extensionless imports through the package, while a relative file is bundled.
import { mixHex } from "../../../packages/ui/src/tokens/mix.ts";
import {
  deriveRoles,
  DEFAULT_ACCENT_ID,
  type Scheme,
} from "../../../packages/ui/src/tokens/themes/palette.ts";

/**
 * The site's colours, derived from the native palette (the default accent). Nothing here is a
 * literal colour: change `palette.ts` and the CSS, favicons, manifest and social image follow.
 */
export function webColors(scheme: Scheme) {
  const roles = deriveRoles(DEFAULT_ACCENT_ID, scheme);
  return {
    canvas: roles.canvas,
    surface: roles.surface,
    control: roles["surface-control"],
    hairline: roles.hairline,
    "hairline-strong": roles["hairline-strong"],
    ink: roles["text-primary"],
    secondary: roles["text-secondary"],
    muted: roles["text-muted"],
    // The fill (primary button) is bright in both modes; `accent-text` is the tone for links and
    // marks on the canvas and darkens in light mode.
    accent: roles.action,
    "accent-text": roles["accent-text"],
    "accent-text-hover": mixHex(roles["accent-text"], roles["text-primary"], 0.25),
    "accent-hover": roles["action-hover"],
    "accent-pressed": roles["action-pressed"],
    "on-accent": roles["on-action"],
    danger: roles.danger,
  };
}

export type WebColors = ReturnType<typeof webColors>;

const declarations = (colors: WebColors, indent: string) =>
  Object.entries(colors)
    .map(([name, value]) => `${indent}--${name}: ${value};`)
    .join("\n");

/** Light by default, dark under `prefers-color-scheme: dark`. */
export function themeCss() {
  return [
    ":root {",
    "  color-scheme: light dark;",
    declarations(webColors("light"), "  "),
    "}",
    "@media (prefers-color-scheme: dark) {",
    "  :root {",
    declarations(webColors("dark"), "    "),
    "  }",
    "}",
  ].join("\n");
}
