// SAFETY: the literal role list defines the complete RoleName union.
export const roleNames = [
  // Surfaces and lines
  "canvas",
  "surface",
  "surface-control",
  "surface-floating",
  "hairline",
  "hairline-strong",
  "backdrop",
  // Text
  "text-primary",
  "text-secondary",
  "text-muted",
  "text-disabled",
  // Charts: `chart` is the single-series mark (the accent); chart-1..5 are the series colours,
  // chart-1 being the accent.
  "chart",
  "chart-1",
  "chart-2",
  "chart-3",
  "chart-4",
  "chart-5",
  "focus-ring",
  // The accent: primary action fill, and the mark and text colour for "you / now / earned".
  "action",
  "action-hover",
  "action-pressed",
  "on-action",
  "accent-soft-text",
  // Danger is the only status colour: destructive actions and errors.
  "danger",
  "on-danger",
  "danger-soft-text",
  // Set kinds.
  "set-warmup",
  "set-drop",
  "set-failure",
  "set-top",
  "set-backoff",
  "set-myo",
  "plate-red",
  "plate-blue",
  "plate-yellow",
  "plate-green",
  "plate-white",
  "plate-black",
  "on-plate-dark",
  "on-plate-light",
] as const;

export type RoleName = (typeof roleNames)[number];
export type RoleTokens = Record<RoleName, string>;
