import {
  contrastRatio,
  fromOklch,
  mixHex,
  readableByLightness,
  shiftLightness,
  toOklch,
} from "../mix";
import type { RoleTokens } from "../roles";

/**
 * The theme engine (ADR 0048). Like Linear's, a theme is a few inputs per scheme: a base colour
 * (the canvas), an accent and a contrast level. Surfaces, controls and the ink are derived from
 * the base in OKLCH so they keep its hue; a theme may pin any of them where the derived value is
 * not the one it wants. Status, set-kind, macro and chart colours come from the theme's family.
 * Every text, mark and fill is moved until it meets its contrast rule.
 */

/** What one scheme of a theme is made from. */
export interface SchemeInput {
  /** The page behind everything; its hue tints every neutral. */
  base: string;
  /** The default colour for "you / now", primary buttons and chart-1. */
  accent: string;
  /** Text on the primary action; the better of the ink and the canvas when left out. */
  onAccent?: string;
  /** Hand-picked values that replace a derived one. */
  pin?: Partial<{
    surface: string;
    control: string;
    ink: string;
    muted: string;
    hairline: string;
    action: string;
  }>;
}

/** A theme's own data colours. Text tones are made readable per scheme; fills keep the hue. */
export interface Family {
  success: string;
  warning: string;
  danger: string;
  protein: string;
  carbs: string;
  fat: string;
  "set-warmup": string;
  "set-drop": string;
  "set-failure": string;
  "set-top": string;
  "set-backoff": string;
  "set-myo": string;
  /** Series two to five; series one is the accent. */
  chart: readonly [string, string, string, string];
}

export interface ThemeDefinition {
  light: SchemeInput;
  dark: SchemeInput;
  family: { light: Family; dark: Family };
}

export type Scheme = "light" | "dark";
export type Contrast = "standard" | "increased";

/** Normal text and action labels. */
const TEXT = 4.5;
/** Chart marks are graphics: 3:1 against the page. */
const MARK = 3;

/** Colours that mean the same thing in every theme: plates are physical objects. */
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

/** How far each derived layer sits from the one it is built on, in OKLCH lightness. */
const STEP = {
  light: { surface: 0.025, control: -0.035 },
  dark: { surface: 0.055, control: 0.045 },
};

/** Contrast levels: how close secondary text sits to the ink, how strong lines are. */
const LEVELS = {
  standard: {
    ink: 0,
    secondary: 0.2,
    muted: 0.42,
    disabled: 0.62,
    hairline: 0.04,
    strong: 0.16,
    text: TEXT,
  },
  increased: {
    ink: 0.5,
    secondary: 0.1,
    muted: 0.26,
    disabled: 0.5,
    hairline: 0.1,
    strong: 0.3,
    text: 7,
  },
} as const;

/** The better of the two inks on a fill. */
function inkOn(fill: string, a: string, b: string): string {
  return contrastRatio(fill, a) >= contrastRatio(fill, b) ? a : b;
}

/** The base's hue at text lightness, with just enough chroma to belong to it. */
function derivedInk(base: string, scheme: Scheme): string {
  const { c, h } = toOklch(base);
  return fromOklch({ l: scheme === "light" ? 0.24 : 0.96, c: Math.min(c, 0.02), h });
}

/** Every role of one theme in one scheme and contrast level. */
export function deriveScheme(
  input: SchemeInput,
  family: Family,
  scheme: Scheme,
  contrast: Contrast = "standard",
): RoleTokens {
  const isLight = scheme === "light";
  const level = LEVELS[contrast];
  const canvas = input.base;
  const surface = input.pin?.surface ?? shiftLightness(canvas, STEP[scheme].surface);
  // Light: the control sits below the canvas. Dark: it sits above the surface.
  const control =
    input.pin?.control ??
    (isLight
      ? shiftLightness(canvas, STEP.light.control)
      : shiftLightness(surface, STEP.dark.control));
  // Increased contrast pulls the ink toward pure black or white.
  const ink = mixHex(
    input.pin?.ink ?? derivedInk(canvas, scheme),
    isLight ? "#000000" : "#FFFFFF",
    level.ink,
  );
  const floating = isLight ? surface : mixHex(surface, control, 0.5);
  const doneSoft = mixHex(surface, family.success, isLight ? 0.18 : 0.12);
  const grounds = [canvas, surface];
  // Text also sits on completed-set rows, fields and controls, and floating sheets.
  const textGrounds = [...grounds, doneSoft, control, floating];
  // Tones darken on light pages and lighten on dark ones, keeping their hue.
  const toward = isLight ? -1 : 1;
  const text = (color: string, ratio: number = TEXT) =>
    readableByLightness(color, textGrounds, ratio, toward);
  // The selected-chip fill, tinted by the raw accent so the readable accent can be held to it.
  const identitySoft = mixHex(surface, input.accent, isLight ? 0.12 : 0.14);
  const actionSeed = input.pin?.action ?? input.accent;
  const onAccent = input.onAccent ?? inkOn(actionSeed, ink, canvas);
  // Hover and press move the fill away from its own ink, so the label only gains contrast.
  const shade = inkOn(onAccent, ink, canvas);
  const lightLabel = contrastRatio(onAccent, "#000000") > contrastRatio(onAccent, "#FFFFFF");
  // The fill keeps its label readable (darker under a light label, lighter under a dark one);
  // marks and text in the accent stay readable on the page.
  const action = readableByLightness(actionSeed, [onAccent], TEXT, lightLabel ? -1 : 1);
  const identity = readableByLightness(input.accent, [...grounds, identitySoft], TEXT, toward);
  const onIdentity = inkOn(identity, surface, isLight ? ink : canvas);
  const danger = readableByLightness(family.danger, grounds, TEXT, toward);
  // HeroUI's soft fills tint their underlying surface by up to 20% on press.
  const softText = (fill: string, inkAmount = 0.2) =>
    readableByLightness(
      mixHex(fill, ink, inkAmount),
      textGrounds.map((ground) => mixHex(ground, fill, 0.2)),
      TEXT,
      toward,
    );
  const warningText = text(family.warning);
  const series = (color: string) => readableByLightness(color, grounds, MARK, toward);
  const [chart2, chart3, chart4, chart5] = family.chart;
  return {
    canvas,
    surface,
    "surface-control": control,
    "surface-floating": floating,
    hairline:
      input.pin?.hairline === undefined
        ? mixHex(control, ink, level.hairline)
        : mixHex(input.pin.hairline, ink, contrast === "standard" ? 0 : level.hairline),
    "hairline-strong": mixHex(control, ink, level.strong),
    backdrop: isLight ? "rgb(0 0 0 / 30%)" : "rgb(0 0 0 / 60%)",
    "text-primary": ink,
    "text-secondary": text(mixHex(ink, surface, level.secondary), level.text),
    "text-muted": text(
      contrast === "standard" && input.pin?.muted
        ? input.pin.muted
        : mixHex(ink, surface, level.muted),
      level.text,
    ),
    "text-disabled": mixHex(ink, surface, level.disabled),
    chart: series(input.accent),
    "chart-1": series(input.accent),
    "chart-2": series(chart2),
    "chart-3": series(chart3),
    "chart-4": series(chart4),
    "chart-5": series(chart5),
    identity,
    "identity-soft": identitySoft,
    "on-identity": onIdentity,
    "brand-detail": identity,
    "focus-ring": identity,
    action,
    "action-hover": mixHex(action, shade, 0.08),
    "action-pressed": mixHex(action, shade, 0.16),
    "on-action": onAccent,
    "accent-soft-text": softText(action),
    danger,
    "on-danger": inkOn(danger, "#FFFFFF", "#111214"),
    "danger-soft-text": softText(danger),
    success: family.success,
    "success-text": text(family.success),
    "on-success": inkOn(family.success, "#FFFFFF", "#111214"),
    "success-soft-text": softText(family.success, 0.3),
    warning: family.warning,
    "warning-text": warningText,
    // HeroUI's `warning` fill is the readable tone, so its label is chosen against that.
    "on-warning": inkOn(warningText, "#FFFFFF", "#111214"),
    "set-done": family.success,
    "on-set-done": inkOn(family.success, "#FFFFFF", "#111214"),
    "set-done-soft": doneSoft,
    "set-done-soft-foreground": ink,
    "set-warmup": text(family["set-warmup"]),
    "set-drop": text(family["set-drop"]),
    "set-failure": text(family["set-failure"]),
    "set-top": text(family["set-top"]),
    "set-backoff": text(family["set-backoff"]),
    "set-myo": text(family["set-myo"]),
    ...plates,
    protein: family.protein,
    "protein-text": text(family.protein),
    carbs: family.carbs,
    "carbs-text": text(family.carbs),
    fat: family.fat,
    "fat-text": text(family.fat),
  };
}

/** Every variant of a theme: each scheme at each contrast level. */
export function buildTheme(theme: ThemeDefinition) {
  const scheme = (name: Scheme, contrast: Contrast) =>
    deriveScheme(theme[name], theme.family[name], name, contrast);
  return {
    light: scheme("light", "standard"),
    dark: scheme("dark", "standard"),
    "light-contrast": scheme("light", "increased"),
    "dark-contrast": scheme("dark", "increased"),
  };
}
