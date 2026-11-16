import type { RoleName, RoleTokens } from "../roles";

/** The roles an accent supplies; the base defines every other role. */
export type AccentRole =
  | "chart"
  | "identity"
  | "identity-soft"
  | "on-identity"
  | "brand-detail"
  | "focus-ring"
  | "action"
  | "action-hover"
  | "action-pressed"
  | "on-action";
export type BaseTokens = Record<Exclude<RoleName, AccentRole>, string>;
export type AccentTokens = Pick<RoleTokens, AccentRole>;

/** Colours that mean the same thing in every mode: plates are physical objects. */
const plates = {
  "plate-red": "#C62828",
  "plate-blue": "#1556B8",
  "plate-yellow": "#F2C230",
  "plate-green": "#197A42",
  "plate-white": "#F4F4F6",
  "plate-black": "#202124",
  "on-plate-dark": "#FFFFFF",
  "on-plate-light": "#111214",
};

/** Graphite: one cool neutral base. Light, dark, and a true-black dark for OLED screens. */
export const light: BaseTokens = {
  canvas: "#F3F4F6",
  surface: "#FFFFFF",
  "surface-control": "#E8E9ED",
  "surface-floating": "#FFFFFF",
  hairline: "#E2E3E7",
  "hairline-strong": "#C9CACF",
  backdrop: "rgb(0 0 0 / 30%)",
  "text-primary": "#111214",
  "text-secondary": "#3C3D42",
  "text-muted": "#62646B",
  "text-disabled": "#A3A4AA",
  danger: "#D21F4B",
  "on-danger": "#FFFFFF",
  success: "#2FB872",
  "success-text": "#177A4B",
  "on-success": "#111214",
  "set-done": "#2FB872",
  "on-set-done": "#111214",
  "set-done-soft": "#EEF9F2",
  "set-done-soft-foreground": "#111214",
  warning: "#F2B21B",
  "warning-text": "#8F6200",
  "on-warning": "#FFFFFF",
  "set-warmup": "#0B6FA8",
  "set-drop": "#8F6200",
  "set-failure": "#9B407F",
  "set-top": "#7052AD",
  "set-backoff": "#137858",
  "set-myo": "#A34D1B",
  ...plates,
  protein: "#1A86CC",
  "protein-text": "#0B6FA8",
  carbs: "#BF8500",
  "carbs-text": "#8F6200",
  fat: "#B0509B",
  "fat-text": "#94407F",
};

export const dark: BaseTokens = {
  canvas: "#0B0C0E",
  surface: "#141518",
  "surface-control": "#1E2024",
  "surface-floating": "#191A1E",
  hairline: "#26282B",
  "hairline-strong": "#393B3F",
  backdrop: "rgb(0 0 0 / 60%)",
  "text-primary": "#F3F4F6",
  "text-secondary": "#CDCED2",
  "text-muted": "#9A9CA3",
  "text-disabled": "#6A6B6E",
  danger: "#FF5C7A",
  "on-danger": "#07080A",
  success: "#59D499",
  "success-text": "#59D499",
  "on-success": "#07080A",
  "set-done": "#59D499",
  "on-set-done": "#07080A",
  "set-done-soft": "#17392A",
  "set-done-soft-foreground": "#F4F4F6",
  warning: "#FFC533",
  "warning-text": "#FFC533",
  "on-warning": "#07080A",
  "set-warmup": "#57C1FF",
  "set-drop": "#FFC533",
  "set-failure": "#D98BC4",
  "set-top": "#B6A1FF",
  "set-backoff": "#68D4B0",
  "set-myo": "#FFAA78",
  ...plates,
  protein: "#57C1FF",
  "protein-text": "#57C1FF",
  carbs: "#FFC533",
  "carbs-text": "#FFC533",
  fat: "#D98BC4",
  "fat-text": "#D98BC4",
};

/** Dark with a pure black canvas; surfaces step up from black. */
export const black: BaseTokens = {
  ...dark,
  canvas: "#000000",
  surface: "#0E0F10",
  "surface-control": "#1A1B1D",
  "surface-floating": "#141516",
  hairline: "#1F2022",
  "hairline-strong": "#34363A",
  "text-muted": "#96989E",
  "set-done-soft": "#12301F",
};
