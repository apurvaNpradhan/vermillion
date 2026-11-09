import { darkColors } from "./tokens";

// Dark mode is opt-in per element through these classes. Everything is also a plain hex colour in
// the inline styles, so clients that ignore the media query still render readable mail.
const rules: Array<[string, string]> = [
  [".m-bg", `background-color:${darkColors.canvas}`],
  [".m-card", `background-color:${darkColors.surface};border-color:${darkColors.hairline}`],
  [".m-text", `color:${darkColors.textPrimary}`],
  [".m-secondary", `color:${darkColors.textSecondary}`],
  [".m-muted", `color:${darkColors.textMuted}`],
  [
    ".m-code",
    `background-color:${darkColors.control};border-color:${darkColors.hairline};color:${darkColors.textPrimary}`,
  ],
  [".m-divider", `border-color:${darkColors.hairline}`],
  [
    ".m-btn",
    `background-color:${darkColors.action};border-color:${darkColors.action};color:${darkColors.onAction}`,
  ],
  [".m-link", `color:${darkColors.textPrimary}`],
];

function important(declarations: string) {
  return declarations
    .split(";")
    .map((declaration) => `${declaration}!important`)
    .join(";");
}

const darkRules = rules
  .map(([selector, declarations]) => `${selector}{${important(declarations)}}`)
  .join("");

// Outlook.com and some Gmail apps rewrite colours instead of reading the media query.
const clientRules = rules
  .map(
    ([selector, declarations]) =>
      `[data-ogsc] ${selector},[data-ogsb] ${selector}{${important(declarations)}}`,
  )
  .join("");

export const themeCss = [
  ":root{color-scheme:light dark;supported-color-schemes:light dark}",
  "a[x-apple-data-detectors]{color:inherit!important;text-decoration:none!important;font-size:inherit!important;font-family:inherit!important;font-weight:inherit!important;line-height:inherit!important}",
  "@media (prefers-color-scheme: dark){",
  darkRules,
  "}",
  clientRules,
].join("");
