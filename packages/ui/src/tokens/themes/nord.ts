import type { Family, ThemeDefinition } from "./engine";

/**
 * Nord, the app's default theme (ADR 0048), after Arctic Ice Studio's Nord palette
 * (nordtheme.com, MIT). Polar Night surfaces, Snow Storm ink, a Frost accent and the Aurora
 * family for status, set kinds and charts. The dark canvas sits one step below Nord's own
 * `#2E3440`, which becomes the card colour, so layers read clearly during a workout.
 */

/** Aurora and Frost: the theme's data colours, made readable per scheme by the engine. */
const aurora: Family = {
  success: "#A3BE8C",
  warning: "#EBCB8B",
  danger: "#BF616A",
  protein: "#81A1C1",
  carbs: "#EBCB8B",
  fat: "#B48EAD",
  "set-warmup": "#81A1C1",
  "set-drop": "#EBCB8B",
  "set-failure": "#BF616A",
  "set-top": "#B48EAD",
  "set-backoff": "#8FBCBB",
  "set-myo": "#D08770",
  chart: ["#A3BE8C", "#B48EAD", "#D08770", "#EBCB8B"],
};

/** Light fills sit on near-white cards, so the done fill takes a deeper Aurora green. */
const auroraLight: Family = { ...aurora, success: "#8FAE76" };

export const nord: ThemeDefinition = {
  light: {
    base: "#ECEFF4",
    accent: "#5E81AC",
    onAccent: "#FFFFFF",
    pin: { surface: "#F8FAFC", ink: "#2E3440" },
  },
  dark: {
    base: "#1F232B",
    accent: "#88C0D0",
    onAccent: "#2E3440",
    pin: { surface: "#2E3440", control: "#3B4252", ink: "#ECEFF4" },
  },
  family: { light: auroraLight, dark: aurora },
};
