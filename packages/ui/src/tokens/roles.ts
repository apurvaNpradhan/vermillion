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
  // Identity is separate from actions, data and status. Classic remains neutral.
  "chart",
  "identity",
  "identity-soft",
  /** Icon and label color on an `identity` fill. */
  "on-identity",
  "brand-detail",
  "focus-ring",
  // Primary action: neutral in Classic; the palette accent in other themes.
  "action",
  "action-hover",
  "action-pressed",
  "on-action",
  // Status. `*-text` is the readable text tone; `on-*` is text placed on the status fill.
  "danger",
  "on-danger",
  "success",
  "success-text",
  "on-success",
  "warning",
  "warning-text",
  "on-warning",
  // A completed set: a light green row and a green tick.
  "set-done",
  "on-set-done",
  "set-done-soft",
  "set-done-soft-foreground",
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
  // Macros (data colors): fill for rings and bars, `*-text` for values.
  "protein",
  "protein-text",
  "carbs",
  "carbs-text",
  "fat",
  "fat-text",
] as const;

export type RoleName = (typeof roleNames)[number];
export type RoleTokens = Record<RoleName, string>;
