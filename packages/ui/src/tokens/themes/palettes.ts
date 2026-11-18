import { contrastRatio, mixHex, readable, stepped } from "../mix";
import type { RoleTokens } from "../roles";

/** The hand-picked colours of one palette in one scheme. Every other role is derived. */
interface Seeds {
  /** The page behind everything. */
  canvas: string;
  /** Cards and rows: lighter than the canvas in light, one step above it in dark. */
  surface: string;
  /** The strongest text colour; neutrals are mixed toward it, so it sets the tint. */
  ink: string;
  /** The one colour: buttons, selection, charts. */
  accent: string;
  /** Text on the accent. */
  onAccent: string;
}

interface PaletteSeeds {
  light: Seeds;
  dark: Seeds;
}

/** Website and email brand colours. */
export const brandSeeds = {
  light: {
    canvas: "#F3F0EA",
    surface: "#FDFCFA",
    ink: "#1B1717",
    accent: "#F95C4B",
    onAccent: "#FFFFFF",
  },
  dark: {
    canvas: "#141111",
    surface: "#1D1919",
    ink: "#EDEBDD",
    accent: "#F95C4B",
    onAccent: "#1B1717",
  },
} satisfies PaletteSeeds;

/** Neutral native colours while the replacement palettes are being evaluated. */
export const nativeSeeds = {
  light: {
    canvas: "#F2F2F2",
    surface: "#FFFFFF",
    ink: "#181818",
    accent: "#292929",
    onAccent: "#FFFFFF",
  },
  dark: {
    canvas: "#171717",
    surface: "#232323",
    ink: "#F4F4F4",
    accent: "#DADADA",
    onAccent: "#171717",
  },
} satisfies PaletteSeeds;

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

/** Status, set-kind and macro colours: muted to sit beside tinted neutrals, shared by palettes. */
const data = {
  light: {
    danger: "#C2364E",
    success: "#4FA77A",
    warning: "#D6A234",
    protein: "#4B86B8",
    carbs: "#BE9233",
    fat: "#A9618F",
    "set-warmup": "#3F79A6",
    "set-drop": "#8C6A1F",
    "set-failure": "#94507C",
    "set-top": "#6F5A9E",
    "set-backoff": "#35796A",
    "set-myo": "#9C5A32",
  },
  dark: {
    danger: "#EE7C8E",
    success: "#74C79C",
    warning: "#E6BF62",
    protein: "#83B8E0",
    carbs: "#E0BE6C",
    fat: "#CF9DC0",
    "set-warmup": "#83B8E0",
    "set-drop": "#E0BE6C",
    "set-failure": "#CF9DC0",
    "set-top": "#B3A6E6",
    "set-backoff": "#85CBB3",
    "set-myo": "#E5AB89",
  },
};

const TEXT = 4.5;
const LAYER_STEP = 0.03;

/** The better of the two inks on a fill. */
function inkOn(fill: string, a: string, b: string): string {
  return contrastRatio(fill, a) >= contrastRatio(fill, b) ? a : b;
}

/** Every role of one palette in one mode, derived from its seeds. */
function derive(seed: Seeds, scheme: "light" | "dark"): RoleTokens {
  const { canvas, surface, ink } = seed;
  const isLight = scheme === "light";
  const tones = data[scheme];
  // Light: the control sits below the canvas. Dark: it sits above the surface.
  const control = stepped(isLight ? canvas : surface, ink, LAYER_STEP);
  const floating = isLight ? surface : mixHex(surface, control, 0.5);
  const doneSoft = mixHex(surface, tones.success, isLight ? 0.14 : 0.2);
  const grounds = [canvas, surface];
  const textGrounds = [...grounds, doneSoft];
  const text = (color: string) => readable(color, textGrounds, ink, TEXT);
  // Hover and press move the fill away from its own ink, so the label only gains contrast.
  const shade = inkOn(seed.onAccent, ink, canvas);
  // The fill keeps its ink readable; marks and text in the accent stay readable on the page.
  const action = readable(seed.accent, [seed.onAccent], shade, TEXT);
  const identity = readable(seed.accent, grounds, ink, TEXT);
  const onIdentity = inkOn(identity, surface, isLight ? ink : canvas);
  const danger = readable(tones.danger, grounds, ink, TEXT);
  return {
    canvas,
    surface,
    "surface-control": control,
    "surface-floating": floating,
    hairline: mixHex(control, ink, 0.04),
    "hairline-strong": mixHex(control, ink, 0.16),
    backdrop: isLight ? "rgb(0 0 0 / 30%)" : "rgb(0 0 0 / 60%)",
    "text-primary": ink,
    "text-secondary": text(mixHex(ink, surface, 0.2)),
    "text-muted": text(mixHex(ink, surface, 0.42)),
    "text-disabled": mixHex(ink, surface, 0.62),
    chart: readable(seed.accent, grounds, ink, 3),
    identity,
    "identity-soft": mixHex(surface, identity, 0.14),
    "on-identity": onIdentity,
    "brand-detail": identity,
    "focus-ring": identity,
    action,
    "action-hover": mixHex(action, shade, 0.08),
    "action-pressed": mixHex(action, shade, 0.16),
    "on-action": seed.onAccent,
    danger,
    "on-danger": inkOn(danger, "#FFFFFF", "#111214"),
    success: tones.success,
    "success-text": text(tones.success),
    "on-success": inkOn(tones.success, "#FFFFFF", "#111214"),
    warning: tones.warning,
    "warning-text": text(tones.warning),
    "on-warning": inkOn(tones.warning, "#FFFFFF", "#111214"),
    "set-done": tones.success,
    "on-set-done": inkOn(tones.success, "#FFFFFF", "#111214"),
    "set-done-soft": doneSoft,
    "set-done-soft-foreground": ink,
    "set-warmup": text(tones["set-warmup"]),
    "set-drop": text(tones["set-drop"]),
    "set-failure": text(tones["set-failure"]),
    "set-top": text(tones["set-top"]),
    "set-backoff": text(tones["set-backoff"]),
    "set-myo": text(tones["set-myo"]),
    ...plates,
    protein: tones.protein,
    "protein-text": text(tones.protein),
    carbs: tones.carbs,
    "carbs-text": text(tones.carbs),
    fat: tones.fat,
    "fat-text": text(tones.fat),
  };
}

/** Dark on a pure black canvas: the dark palette's surface, pulled most of the way to black. */
function trueBlack(dark: Seeds): Seeds {
  return { ...dark, canvas: "#000000", surface: mixHex("#000000", dark.surface, 0.55) };
}

/** One palette's complete role sets: light, dark, and dark on true black. */
export function buildPalette({ light, dark }: PaletteSeeds) {
  return {
    light: derive(light, "light"),
    dark: derive(dark, "dark"),
    black: derive(trueBlack(dark), "dark"),
  };
}
