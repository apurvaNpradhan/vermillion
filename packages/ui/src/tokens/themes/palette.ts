import { contrastRatio, mixHex, readable } from "../mix";
import type { RoleTokens } from "../roles";

/**
 * The Sigil palette (docs/design/redesign-2026-11/SPEC.md): two neutral modes and six accents.
 *
 * Dark is true AMOLED (`#000000` ground, near-black raised surfaces, white ink); light is pure
 * white with neutral greys and near-black ink. Neither has a tint. The accent is a separate axis:
 * each one has a bright fill, a text tone and the label that sits on the fill. The accent marks the
 * primary action, the current and completed sets, records, the selected tab and chips, and the
 * primary chart series, and nothing else. Red is the only status colour.
 */

export const accentIds = ["lime", "gold", "ember", "rose", "ice", "mono"] as const;
export type AccentId = (typeof accentIds)[number];
/** The accent a new install starts on; every retired or unknown id falls back to it. */
export const DEFAULT_ACCENT_ID: AccentId = "lime";

export const schemes = ["light", "dark"] as const;
export type Scheme = (typeof schemes)[number];

/**
 * One accent in one mode. The fill stays bright in both modes (buttons, ticks, completed-row
 * tint, selected chips, chart lines, the current-set bar); `text` is the tone for accent-coloured
 * text and icons on the canvas and darkens in light mode. `onAccent` is the label on the fill.
 */
interface AccentValue {
  fill: string;
  text: string;
  onAccent: string;
}

const coloured = (fill: string, lightText: string): Record<Scheme, AccentValue> => ({
  dark: { fill, text: fill, onAccent: "#0A0A0A" },
  light: { fill, text: lightText, onAccent: "#0A0A0A" },
});

/** Hand-tuned: the text tone reads at 4.5:1 on the canvas and surface, the label on the fill too. */
const accents: Record<AccentId, Record<Scheme, AccentValue>> = {
  lime: coloured("#C6F135", "#4A6A00"),
  gold: coloured("#FFC83D", "#8A5A00"),
  ember: coloured("#FF6B3D", "#B33A12"),
  rose: coloured("#FF5C8A", "#B8124A"),
  ice: coloured("#9BE6FF", "#0B6A8A"),
  // White on dark, black on light; the text equals the fill.
  mono: {
    dark: { fill: "#FFFFFF", text: "#FFFFFF", onAccent: "#000000" },
    light: { fill: "#000000", text: "#000000", onAccent: "#FFFFFF" },
  },
};

/** Neutral roles of one mode; no hue anywhere. */
interface Neutrals {
  canvas: string;
  surface: string;
  control: string;
  floating: string;
  hairline: string;
  hairlineStrong: string;
  ink: string;
  secondary: string;
  muted: string;
  disabled: string;
  backdrop: string;
}

const neutrals: Record<Scheme, Neutrals> = {
  dark: {
    canvas: "#000000",
    surface: "#0A0A0A",
    control: "#1C1C1C",
    floating: "#141414",
    hairline: "#1F1F1F",
    hairlineStrong: "#383838",
    ink: "#FFFFFF",
    secondary: "#D4D4D4",
    muted: "#A1A1A1",
    disabled: "#5C5C5C",
    backdrop: "rgb(0 0 0 / 60%)",
  },
  light: {
    canvas: "#FFFFFF",
    surface: "#F5F5F5",
    control: "#EBEBEB",
    floating: "#FFFFFF",
    hairline: "#E5E5E5",
    hairlineStrong: "#C8C8C8",
    ink: "#0A0A0A",
    secondary: "#404040",
    muted: "#545454",
    disabled: "#A3A3A3",
    backdrop: "rgb(0 0 0 / 30%)",
  },
};

/** Red, for destructive actions and errors only. */
const danger: Record<Scheme, string> = {
  dark: "#FF5A5F",
  light: "#C62828",
};

/**
 * Series two to five of a chart: quiet categorical tones; series one is the accent. They keep
 * 3:1 against the canvas and the card.
 */
const series: Record<Scheme, readonly [string, string, string, string]> = {
  dark: ["#8DA7C7", "#C7A78D", "#9BC7A9", "#BDA3C9"],
  light: ["#4F6B8E", "#8E6B4F", "#4F8E64", "#7E5C91"],
};

/** Set kinds: a small tag colour that reads as text on the canvas, card and a completed row. */
const setKinds: Record<
  Scheme,
  Record<"warmup" | "drop" | "failure" | "top" | "backoff" | "myo", string>
> = {
  dark: {
    warmup: "#7FB0E8",
    drop: "#D9B36A",
    failure: "#FF7B80",
    top: "#C79BE0",
    backoff: "#7FCBC3",
    myo: "#E59A78",
  },
  light: {
    warmup: "#1A5799",
    drop: "#6F4E00",
    failure: "#A8211A",
    top: "#6F3592",
    backoff: "#0F5E58",
    myo: "#8F3F14",
  },
};

/** Plates are physical objects: the same in every theme. */
const plates = {
  "plate-red": "#C62828",
  "plate-blue": "#1556B8",
  "plate-yellow": "#F2C230",
  "plate-green": "#197A42",
  "plate-white": "#F4F4F6",
  "plate-black": "#202124",
  "on-plate-dark": "#FFFFFF",
  "on-plate-light": "#111214",
} as const;

/** The better of two inks on a fill. */
const inkOn = (fill: string, a: string, b: string) =>
  contrastRatio(fill, a) >= contrastRatio(fill, b) ? a : b;

/** Every role of one accent in one mode. */
export function deriveRoles(accentId: AccentId, scheme: Scheme): RoleTokens {
  const n = neutrals[scheme];
  const { fill: accent, text: accentText, onAccent } = accents[accentId][scheme];
  // Hover and press move the fill away from its label, so the label only gains contrast.
  const away = inkOn(onAccent, n.ink, n.canvas);
  const [chart2, chart3, chart4, chart5] = series[scheme];
  const kinds = setKinds[scheme];
  // HeroUI's soft fills tint the surface with their colour by up to 20% on press; the label stays
  // readable on every ground it can sit on.
  const grounds = [n.canvas, n.surface, n.control, n.floating];
  const softText = (fill: string) =>
    readable(
      fill,
      grounds.map((ground) => mixHex(ground, fill, 0.2)),
      n.ink,
      4.5,
    );
  return {
    canvas: n.canvas,
    surface: n.surface,
    "surface-control": n.control,
    "surface-floating": n.floating,
    hairline: n.hairline,
    "hairline-strong": n.hairlineStrong,
    backdrop: n.backdrop,
    "text-primary": n.ink,
    "text-secondary": n.secondary,
    "text-muted": n.muted,
    "text-disabled": n.disabled,
    chart: accent,
    "chart-1": accent,
    "chart-2": chart2,
    "chart-3": chart3,
    "chart-4": chart4,
    "chart-5": chart5,
    "focus-ring": n.ink,
    action: accent,
    "action-hover": mixHex(accent, away, 0.08),
    "action-pressed": mixHex(accent, away, 0.16),
    "on-action": onAccent,
    "accent-text": accentText,
    "accent-soft-text": softText(accent),
    danger: danger[scheme],
    "on-danger": inkOn(danger[scheme], "#FFFFFF", "#111214"),
    "danger-soft-text": softText(danger[scheme]),
    "set-warmup": kinds.warmup,
    "set-drop": kinds.drop,
    "set-failure": kinds.failure,
    "set-top": kinds.top,
    "set-backoff": kinds.backoff,
    "set-myo": kinds.myo,
    ...plates,
  };
}
